import { Injectable, Logger } from '@nestjs/common';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  NoObjectGeneratedError,
  generateObject,
  generateText,
  hasToolCall,
  stepCountIs,
  streamText,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import type { LanguageModel } from 'ai';
import { z, type ZodType } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import {
  classifyFailure,
  formatIssue,
  isModelRetired,
  isRateLimited,
  isResponseFormatUnsupported,
  schemaIssues,
  truncateError,
  type FailureKind,
} from '../failure-kind.js';
import { formatModelRef, parseModelRef } from '../model-ref.js';
import { providerIds } from '../providers/index.js';
import {
  ModelCatalogService,
  ModelUnavailableError,
} from './model-catalog.service.js';

/**
 * Ai gọi và gọi để làm gì. Bắt buộc: không có nó thì nhật ký chỉ cho biết
 * "có lỗi" mà không cho biết tác vụ nào đang hỏng.
 */
export type AiCallContext = {
  purpose: string;
  userId?: string;
};

export type GenerateObjectOptions<T> = {
  schema: ZodType<T>;
  system: string;
  prompt: string;
  context: AiCallContext;
  modelId?: string;
  maxRetries?: number;
  timeoutMs?: number;
};

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

type StreamTextResult = ReturnType<typeof streamText>;

export type StreamTextOptions = {
  system: string;
  prompt: string;
  modelId?: string;
};

/**
 * Một bước của vòng lặp agent: model nói gì, gọi tool nào, tool trả về gì.
 *
 * Ghi lại TỪNG bước chứ không chỉ kết quả cuối, vì một agent chạy sai thường
 * sai ở giữa - gọi nhầm tool, hoặc nhận về rác rồi vẫn viết tiếp như thật.
 * Không có nhật ký bước thì không có cách nào biết nó sai ở đâu.
 */
export type AgentStepLog = {
  index: number;
  text: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
  toolResults: Array<{ tool: string; output: unknown }>;
  durationMs: number;
  /**
   * Toàn bộ hội thoại TÍNH TỚI hết bước này, gồm cả câu hỏi mở đầu.
   *
   * Đây là điểm khôi phục: lượt chạy chết ở bước 5 vẫn còn nguyên trạng thái
   * sau bước 4, nên chạy tiếp không phải làm lại từ đầu. Không có nó thì một
   * lượt hết giờ mất trắng mọi thứ đã tốn tiền để dựng.
   */
  messages: ModelMessage[];
};

export type RunToolsOptions = {
  system: string;
  /** Lượt chạy MỚI dùng `prompt`; lượt chạy TIẾP dùng `messages`. */
  prompt?: string;
  messages?: ModelMessage[];
  tools: ToolSet;
  context: AiCallContext;
  modelId?: string;
  /**
   * Trần số bước. Đây là chặn cuối chống vòng lặp vô tận - model hoàn toàn có
   * thể gọi đi gọi lại một tool mãi mãi, và mỗi bước là một lượt gọi tính tiền.
   */
  maxSteps?: number;
  /** Hạn cho TOÀN BỘ vòng lặp, không phải cho một bước. */
  timeoutMs?: number;
  /**
   * Dừng vòng lặp ngay sau khi model gọi tool này.
   *
   * Dùng cho `ask_user`: agent hỏi xong thì phải nhả worker ra chứ không được
   * đứng chờ người dùng - câu trả lời có thể tới sau vài giờ, ở một request
   * khác. Lịch sử hội thoại trả về trong `messages` để nạp lại lúc đó.
   */
  stopOnTool?: string;
  /** Gọi sau mỗi bước, để nơi dùng ghi tiến trình xuống DB ngay lúc chạy. */
  onStep?: (step: AgentStepLog) => Promise<void>;
};

export type RunToolsResult = {
  text: string;
  steps: AgentStepLog[];
  finishReason: string;
  modelId: string;
  /** Toàn bộ hội thoại sau lượt chạy, để chạy tiếp về sau. */
  messages: ModelMessage[];
};

/** Mặt tiếp xúc mà các module khác dùng để gọi model. */
export type Ai = Pick<AiService, 'generateObject' | 'runTools'>;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly fallbackModelIds: string[];
  private readonly defaultModelId: string;
  private readonly defaultProviderId: string;

  constructor(
    private readonly catalog: ModelCatalogService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.structuredOutputs =
      config.get<boolean>('ai.structuredOutputs') ?? false;
    this.fallbackModelIds = config.get<string[]>('ai.fallbackModelIds') ?? [];
    this.defaultModelId = config.get<string>('ai.modelId') ?? '';
    this.defaultProviderId = config.get<string>('ai.provider') ?? '';
  }

  /** Dạng đầy đủ `lõi/model`, để so trùng không phụ thuộc cách viết tắt. */
  private canonical(ref: string): string {
    return formatModelRef(
      parseModelRef(ref, providerIds(), this.defaultProviderId),
    );
  }

  /**
   * Thứ tự mắt xích sẽ thử cho MỘT lời gọi. So trùng theo dạng đầy đủ, nếu
   * không thì `deepseek-v4-flash-free` và `opencode/deepseek-v4-flash-free`
   * thành hai mắt xích và model vừa hết hạn mức sẽ được thử lại ngay lập tức.
   */
  private modelChain(requested?: string): Array<string | undefined> {
    // Giữ `undefined` khi không cấu hình model mặc định, để catalog dùng mặc
    // định của chính nó thay vì đi hỏi một model tên rỗng.
    const first = requested ?? (this.defaultModelId || undefined);
    const chain: Array<string | undefined> = [first];
    const seen = new Set([this.canonical(first ?? this.defaultModelId)]);

    for (const id of this.fallbackModelIds) {
      const key = this.canonical(id);
      if (seen.has(key)) continue;
      seen.add(key);
      chain.push(id);
    }
    return chain;
  }

  /** Ghi lại một lần gọi. KHÔNG bao giờ được làm hỏng lần gọi thật. */
  private async record(entry: {
    context: AiCallContext;
    provider: string;
    modelId: string;
    ok: boolean;
    durationMs: number;
    failureKind?: FailureKind;
    errorMessage?: string;
    inputTokens?: number;
    outputTokens?: number;
  }): Promise<void> {
    try {
      await this.prisma.aiCall.create({
        data: {
          userId: entry.context.userId ?? null,
          purpose: entry.context.purpose,
          provider: entry.provider,
          modelId: entry.modelId,
          ok: entry.ok,
          durationMs: entry.durationMs,
          failureKind: entry.failureKind ?? null,
          errorMessage: entry.errorMessage ?? null,
          inputTokens: entry.inputTokens ?? null,
          outputTokens: entry.outputTokens ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Không ghi được nhật ký AiCall: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Chế độ đang dùng để ép định dạng đầu ra. */
  private structuredOutputs: boolean;

  /**
   * Mọi lõi đều chạy qua `createOpenAICompatible`, kể cả OpenRouter: API của nó
   * là OpenAI-compatible nên không cần adapter thứ hai. Cái thay đổi theo lõi
   * chỉ là `baseURL` và `apiKey`, và cả hai đến từ `catalog.resolve()`.
   */
  private async languageModel(
    modelId: string | undefined,
    structuredOutputs: boolean,
  ): Promise<{
    model: LanguageModel;
    id: string;
    provider: string;
    ref: string;
  }> {
    const resolved = await this.catalog.resolve(modelId);
    const userAgent = resolved.headers['User-Agent'];
    this.logger.debug(
      `AI headers cho ${resolved.model.id}: ${JSON.stringify(resolved.headers)}`,
    );

    const originalFetch = globalThis.fetch;
    const forceUserAgentFetch: typeof globalThis.fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      if (userAgent) {
        headers.set('User-Agent', userAgent);
      }
      return originalFetch(input, { ...init, headers });
    };

    const provider = createOpenAICompatible({
      name: resolved.providerId,
      baseURL: resolved.baseURL,
      apiKey: resolved.apiKey,
      supportsStructuredOutputs: structuredOutputs,
      headers: resolved.headers,
      fetch: forceUserAgentFetch,
    });
    return {
      model: provider(resolved.model.id),
      id: resolved.model.id,
      provider: resolved.providerId,
      ref: formatModelRef({
        providerId: resolved.providerId,
        modelId: resolved.model.id,
      }),
    };
  }

  /**
   * Sinh dữ liệu có cấu trúc theo schema Zod.
   *
   * Chuỗi đi tiếp trong đúng HAI trường hợp, và cả hai đều là "mắt xích này
   * không dùng được" chứ không phải "tác vụ này hỏng": hết hạn mức, hoặc model
   * không khả dụng (thiếu key, lõi không phục vụ, bị chặn vì trả tiền, đã đo là
   * không giữ nổi structured output). Mọi lỗi khác ném ra ngay — đặc biệt là lỗi
   * schema, vì đổi model khi model trả sai định dạng sẽ giấu mất tín hiệu "model
   * này quá yếu cho tác vụ".
   */
  async generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    return this.overChain(options.modelId, (modelId) =>
      this.withFormatFallback({ ...options, modelId }),
    );
  }

  /**
   * Chạy `attempt` lần lượt trên chuỗi model cho tới khi có cái chạy được.
   *
   * Dùng chung cho `generateObject` và `runTools` để hai đường không thể lệch
   * nhau về ý nghĩa của "bỏ qua mắt xích này".
   */
  private async overChain<T>(
    requested: string | undefined,
    attempt: (modelId: string | undefined) => Promise<T>,
  ): Promise<T> {
    const chain = this.modelChain(requested);
    let lastSkipped: unknown;

    for (const [index, modelId] of chain.entries()) {
      try {
        return await attempt(modelId);
      } catch (error) {
        const unavailable = error instanceof ModelUnavailableError;
        const retired = isModelRetired(error);
        if (!unavailable && !isRateLimited(error) && !retired) throw error;

        lastSkipped = error;
        const reason = unavailable
          ? error.message
          : retired
            ? 'gateway đã rút model này'
            : 'hết hạn mức';
        const next = chain[index + 1];
        this.logger.warn(
          next
            ? `Bỏ qua ${modelId ?? '(mặc định)'} (${reason}), thử ${next}`
            : `Bỏ qua ${modelId ?? '(mặc định)'} (${reason}) và không còn mắt xích dự phòng`,
        );
      }
    }

    throw lastSkipped;
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
   * Dùng lại đúng chuỗi dự phòng của `generateObject`: hết hạn mức hay model bị
   * rút thì đổi mắt xích, lỗi khác thì ném ra ngay.
   */
  async runTools(options: RunToolsOptions): Promise<RunToolsResult> {
    return this.overChain(options.modelId, (modelId) =>
      this.attemptTools({ ...options, modelId }),
    );
  }

  private async attemptTools(
    options: RunToolsOptions,
  ): Promise<RunToolsResult> {
    const { model, id, provider, ref } = await this.languageModel(
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

      await this.record({
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
      await this.record({
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

  /** Bơm JSON Schema thẳng vào system prompt. */
  private withSchemaInstruction<T>(system: string, schema: ZodType<T>): string {
    let json: unknown;
    try {
      json = z.toJSONSchema(schema);
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
    const { model, id, provider, ref } = await this.languageModel(
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

      await this.record({
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

      await this.record({
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

  /** Stream văn bản cho các màn hình người dùng ngồi chờ (CV, cover letter). */
  async streamText(
    options: StreamTextOptions,
  ): Promise<{ modelId: string; result: StreamTextResult }> {
    const { model, id } = await this.languageModel(options.modelId, false);
    return {
      modelId: id,
      result: streamText({
        model,
        system: options.system,
        prompt: options.prompt,
      }),
    };
  }
}
