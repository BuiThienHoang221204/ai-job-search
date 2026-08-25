import { Injectable, Logger } from '@nestjs/common';
import {
  NoObjectGeneratedError,
  generateObject,
  generateText,
  hasToolCall,
  stepCountIs,
  streamText,
  type ModelMessage,
} from 'ai';
import { z, type ZodType } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import {
  classifyFailure,
  formatIssue,
  isResponseFormatUnsupported,
  schemaIssues,
  truncateError,
} from '../failure-kind.js';
import { AiCallLog } from './ai-call-log.js';
import { LanguageModelFactory } from './language-model.js';
import { ModelCatalogService } from './model-catalog.service.js';
import { ModelChain, type ChainProgress } from './model-chain.js';
import type {
  Ai,
  AgentStepLog,
  GenerateObjectOptions,
  RunToolsOptions,
  RunToolsResult,
  StreamTextOptions,
  StreamTextResult,
} from './ai.types.js';

/**
 * Gateway free của OpenCode không trả 429 khi bị quá tải - nó chỉ chậm dần.
 * Đã đo được một lần gọi kéo dài 517 giây. Không có hạn này thì một request
 * đồng bộ sẽ treo gần 9 phút, còn job trong hàng đợi sẽ ôm chỗ worker suốt
 */
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Trần bước mặc định cho một vòng lặp agent.
 *
 * 12 bước đủ cho kịch bản `/apply` (đọc hồ sơ, đọc khung, tra web, viết, tự
 * kiểm) mà vẫn chặn được vòng lặp tự nuôi. Mỗi bước là MỘT lượt gọi tính vào
 * hạn mức, nên đây là trần chi phí chứ không chỉ là trần thời gian.
 */
const DEFAULT_MAX_STEPS = 12;

/** Trần ký tự khi in nguyên văn thứ model trả về. */
const LOG_TEXT_LIMIT = 4000;

/** Cắt giữa chứ không cắt đuôi: trường bị thiếu thường nằm ở cuối JSON. */
const clipMiddle = (text: string, limit: number): string => {
  if (text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  return [
    text.slice(0, half),
    `… [bỏ ${text.length - limit} ký tự ở giữa] …`,
    text.slice(-half),
  ].join('\n');
};

/**
 * Hạn cho CẢ vòng lặp, không phải cho một bước.
 *
 * KHÔNG bị chặn bởi `server.setTimeout` 5 phút như tác vụ một-lượt: vòng lặp
 * agent chạy trong worker của hàng đợi, không nằm trong một HTTP request nào.
 * Bản đầu đặt 270s vì nhầm điều đó, và đã trả giá - đo được một bước
 * `save_artifact` viết file `.tex` hết **261 giây**, gần trọn ngân sách, nên cả
 * lượt chạy hỏng dù CV đã soạn xong.
 *
 * Trần thật là hạn của pg-boss (mặc định 15 phút). Giữ dưới 10 phút để cùng một
 * mô hình với `STUCK_AFTER_MS` của reconcile.
 */
const DEFAULT_AGENT_TIMEOUT_MS = 540_000;

/**
 * Mọi lời gọi model của cả hệ thống đi qua đây.
 *
 * Ba cộng tác viên bên dưới là seam NỘI BỘ - chúng không xuất hiện trong `Ai`,
 * và không module nào ngoài file này được dựng chúng: `ModelChain` giữ chính
 * sách dự phòng, `AiCallLog` giữ sổ, `LanguageModelFactory` dựng đối tượng
 * model. Tách ra để mỗi thứ đọc được một mình, không phải để mở rộng mặt tiếp
 * xúc - caller vẫn chỉ cần biết ba method dưới đây.
 */
@Injectable()
export class AiService implements Ai {
  private readonly logger = new Logger(AiService.name);
  private readonly chain: ModelChain;
  private readonly callLog: AiCallLog;
  private readonly models: LanguageModelFactory;

  constructor(
    catalog: ModelCatalogService,
    prisma: PrismaService,
    config: ConfigService,
  ) {
    this.structuredOutputs =
      config.get<boolean>('ai.structuredOutputs') ?? false;
    this.chain = new ModelChain({
      defaultModelId: config.get<string>('ai.modelId') ?? '',
      defaultProviderId: config.get<string>('ai.provider') ?? '',
      fallbackModelIds: config.get<string[]>('ai.fallbackModelIds') ?? [],
      logger: this.logger,
    });
    this.callLog = new AiCallLog(prisma, this.logger);
    this.models = new LanguageModelFactory(catalog, this.logger);
  }

  /** Chế độ đang dùng để ép định dạng đầu ra. */
  private structuredOutputs: boolean;

  /**
   * Sinh dữ liệu có cấu trúc theo schema Zod.
   *
   * Hỏng ở một model thì `ModelChain` quyết định có đi tiếp mắt xích hay không
   * - luật nằm ở `ModelChain.run`, cố ý dùng chung với `runTools` để hai đường
   * không thể lệch nhau về ý nghĩa của "bỏ qua mắt xích này".
   */
  async generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    return this.chain.run(options.modelId, (modelId) =>
      this.withFormatFallback({ ...options, modelId }),
    );
  }

  /**
   * Chạy một vòng lặp agent: model được cấp tool và tự quyết gọi cái nào, bao
   * nhiêu lần, cho tới khi nó thôi gọi hoặc chạm trần số bước.
   *
   * Khác `generateObject` ở CHẤT chứ không chỉ ở lượng: `generateObject` là một
   * lượt hỏi-đáp có hình dạng biết trước, còn ở đây model điều khiển luồng. Vì
   * vậy mọi trần đều là bắt buộc chứ không phải tuỳ chọn - trần bước, hạn thời
   * gian cho cả vòng, và tool nào được cấp thì do NƠI GỌI quyết định.
   *
   * Dùng lại đúng chuỗi dự phòng của `generateObject`, kể cả cái phanh "chưa
   * đi được bước nào mới được đổi model" - xem `ModelChain`.
   */
  async runTools(options: RunToolsOptions): Promise<RunToolsResult> {
    return this.chain.run(options.modelId, (modelId, progress) =>
      this.attemptTools({ ...options, modelId }, progress),
    );
  }

  private async attemptTools(
    options: RunToolsOptions,
    progress: ChainProgress,
  ): Promise<RunToolsResult> {
    const { model, id, provider, ref } = await this.models.create(
      options.modelId,
      this.structuredOutputs,
    );
    const startedAt = Date.now();
    const steps: AgentStepLog[] = [];

    /*
     * `response.messages` của SDK chỉ chứa những gì MODEL sinh ra - không có
     * câu hỏi mở đầu. Lưu mỗi phần đó rồi chạy tiếp là chạy tiếp mà KHÔNG CÒN
     * mô tả công việc: agent phải đoán lại nó đang làm cho tin nào.
     *
     * Nên hội thoại lưu xuống luôn là câu vào + phần model sinh.
     */
    const base: ModelMessage[] = options.messages ?? [
      { role: 'user', content: options.prompt ?? '' },
    ];
    const generated: ModelMessage[] = [];

    /*
     * Mốc để đo TỪNG bước, không phải tổng từ đầu.
     *
     * Bản đầu ghi `Date.now() - startedAt`, tức thời gian tích luỹ - và trên
     * màn hình nó nói dối hai lần: bước cuối trông như tốn 390 giây trong khi
     * thật ra chỉ 107, còn một lượt chạy TIẾP thì đếm lại từ 0 nên các con số
     * không tăng dần, trông như dữ liệu hỏng.
     */
    let stepStartedAt = Date.now();

    try {
      const result = await generateText({
        model,
        system: options.system,
        ...(options.messages
          ? { messages: options.messages }
          : { prompt: options.prompt ?? '' }),
        tools: options.tools,
        stopWhen: options.stopOnTool
          ? [
              stepCountIs(options.maxSteps ?? DEFAULT_MAX_STEPS),
              hasToolCall(options.stopOnTool),
            ]
          : stepCountIs(options.maxSteps ?? DEFAULT_MAX_STEPS),
        abortSignal: AbortSignal.timeout(
          options.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
        ),
        maxRetries: 1,
        onStepFinish: (step) => {
          generated.push(...step.response.messages);
          const log: AgentStepLog = {
            index: steps.length,
            text: step.text ?? '',
            toolCalls: (step.toolCalls ?? []).map((call) => ({
              tool: call.toolName,
              input: call.input as unknown,
            })),
            toolResults: (step.toolResults ?? []).map((entry) => ({
              tool: entry.toolName,
              output: entry.output as unknown,
            })),
            durationMs: Date.now() - stepStartedAt,
            messages: [...base, ...generated],
          };
          stepStartedAt = Date.now();
          steps.push(log);
          progress.spent = true;
          // Ghi tiến trình là việc PHỤ: nó hỏng thì vòng lặp vẫn phải chạy tiếp,
          // nếu không một lỗi ghi DB sẽ giết cả lượt chạy đã tốn tiền.
          void options.onStep?.(log).catch((error: unknown) => {
            this.logger.warn(
              `Không ghi được bước agent: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        },
      });

      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `runTools ${ref} xong sau ${durationMs}ms, ${steps.length} bước`,
      );

      await this.callLog.record({
        context: options.context,
        provider,
        modelId: id,
        ok: true,
        durationMs,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      });

      return {
        text: result.text,
        steps,
        finishReason: result.finishReason,
        modelId: id,
        messages: [...base, ...result.response.messages],
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      await this.callLog.record({
        context: options.context,
        provider,
        modelId: id,
        ok: false,
        durationMs,
        failureKind: classifyFailure(error),
        errorMessage: truncateError(error),
      });
      throw error;
    }
  }

  /** Đổi chế độ ép định dạng nếu gateway từ chối chế độ đang dùng. */
  private async withFormatFallback<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    try {
      return await this.attempt(options, this.structuredOutputs);
    } catch (error) {
      if (!isResponseFormatUnsupported(error)) throw error;

      const fallback = !this.structuredOutputs;
      this.logger.warn(
        `Gateway không nhận response_format ở chế độ structuredOutputs=${this.structuredOutputs}; ` +
          `chuyển sang ${fallback} cho toàn bộ tiến trình`,
      );
      this.structuredOutputs = fallback;
      return this.attempt(options, fallback);
    }
  }

  /**
   * Bơm JSON Schema thẳng vào system prompt.
   *
   * `io: 'input'` là BẮT BUỘC: schema nào có `.transform()` thì bản mặc định
   * ném "Transforms cannot be represented in JSON Schema", và nhánh catch bên
   * dưới nuốt lỗi — model mất sạch phần nhắc mà không ai thấy. Đầu vào cũng là
   * đúng thứ cần mô tả cho model: nó sinh ra bản TRƯỚC transform.
   */
  private withSchemaInstruction<T>(system: string, schema: ZodType<T>): string {
    let json: unknown;
    try {
      json = z.toJSONSchema(schema, { io: 'input' });
    } catch (error) {
      this.logger.warn(
        `Không dựng được JSON Schema để nhắc model: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return system;
    }

    return [
      system,
      '',
      '--- ĐỊNH DẠNG ĐẦU RA BẮT BUỘC ---',
      'Chỉ trả về MỘT đối tượng JSON hợp lệ. Không viết lời dẫn, không giải thích, không rào ```json.',
      'Tên trường phải khớp CHÍNH XÁC JSON Schema dưới đây. Tuyệt đối không đổi tên trường, không thêm trường, không lồng thêm tầng.',
      'Các tiêu đề mục trong khung đánh giá ở trên KHÔNG phải tên trường.',
      JSON.stringify(json),
    ].join('\n');
  }

  private async attempt<T>(
    options: GenerateObjectOptions<T>,
    structuredOutputs: boolean,
  ): Promise<{ object: T; modelId: string }> {
    const { model, id, provider, ref } = await this.models.create(
      options.modelId,
      structuredOutputs,
    );
    const startedAt = Date.now();

    try {
      const result = await generateObject({
        model,
        schema: options.schema,
        system: structuredOutputs
          ? options.system
          : this.withSchemaInstruction(options.system, options.schema),
        prompt: options.prompt,
        maxRetries: options.maxRetries ?? 2,
        abortSignal: AbortSignal.timeout(
          options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ),
      });

      const durationMs = Date.now() - startedAt;
      this.logger.log(`generateObject ${ref} xong sau ${durationMs}ms`);

      await this.callLog.record({
        context: options.context,
        provider,
        modelId: id,
        ok: true,
        durationMs,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      });

      return { object: result.object, modelId: id };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const issues = schemaIssues(error);

      await this.callLog.record({
        context: options.context,
        provider,
        modelId: id,
        ok: false,
        durationMs,
        failureKind: classifyFailure(error),
        errorMessage: issues.length
          ? `${truncateError(error, 200)} | ${issues.map(formatIssue).join(' | ')}`
          : truncateError(error),
      });

      if (NoObjectGeneratedError.isInstance(error)) {
        const text = error.text ?? '';
        this.logger.error(
          [
            `generateObject ${ref} thất bại sau ${durationMs}ms`,
            `finishReason=${error.finishReason} outputTokens=${error.usage?.outputTokens}`,
            issues.length
              ? [
                  `--- lệch schema (${issues.length}) ---`,
                  ...issues.map(formatIssue),
                ].join('\n')
              : '--- không bóc được chi tiết lệch schema (nhiều khả năng JSON hỏng, không phải sai kiểu) ---',
            `--- model trả về (${text.length} ký tự) ---`,
            text ? clipMiddle(text, LOG_TEXT_LIMIT) : '(rỗng)',
          ].join('\n'),
        );
      }
      throw error;
    }
  }

  /**
   * Stream văn bản cho các màn hình người dùng ngồi chờ.
   *
   * KHÔNG có chuỗi model dự phòng, và đó là chủ đích: khi token đầu tiên đã rời
   * đi thì không còn đường lùi sang model khác - trình duyệt đã vẽ nửa câu rồi.
   * Hỏng thì hỏng hẳn, và người gọi quyết định nói gì với người dùng.
   *
   * `onFinish` ghi `ai_calls` khi stream chạy xong. Ghi ở đây chứ không để
   * người gọi tự ghi: đây là chỗ duy nhất biết provider và số token thật, mà
   * một lượt gọi vô hình với màn quản trị thì mọi con số p50 sau này đều sai.
   */
  async streamText(
    options: StreamTextOptions,
  ): Promise<{ modelId: string; result: StreamTextResult }> {
    const { model, id, provider } = await this.models.create(
      options.modelId,
      false,
    );
    const startedAt = Date.now();

    return {
      modelId: id,
      result: streamText({
        model,
        system: options.system,
        ...(options.messages
          ? { messages: options.messages }
          : { prompt: options.prompt ?? '' }),
        onFinish: ({ usage }) => {
          if (!options.context) return;
          void this.callLog.record({
            context: options.context,
            provider,
            modelId: id,
            ok: true,
            durationMs: Date.now() - startedAt,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          });
        },
        onError: ({ error }) => {
          if (!options.context) return;
          void this.callLog.record({
            context: options.context,
            provider,
            modelId: id,
            ok: false,
            durationMs: Date.now() - startedAt,
            failureKind: classifyFailure(error),
            errorMessage: truncateError(error),
          });
        },
      }),
    };
  }
}
