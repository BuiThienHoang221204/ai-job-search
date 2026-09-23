import { Injectable, Logger } from '@nestjs/common';
import {
  NoObjectGeneratedError,
  generateObject,
  streamObject,
  streamText,
} from 'ai';
import type { ZodType } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import {
  classifyFailure,
  formatIssue,
  isResponseFormatUnsupported,
  schemaIssues,
  truncateError,
  type SchemaIssue,
} from '../utils/failure-kind.js';
import { errorMessageOf, schemaInstruction } from '../utils/schema-prompt.js';
import { clipMiddle, emptyStream, streamFrom } from '../utils/stream.js';
import { AiCallLog } from './ai-call-log.js';
import { LanguageModelFactory } from './language-model.js';
import { ModelCatalogService } from './model-catalog.service.js';
import { DEFAULT_CHAIN_BUDGET_MS, ModelChain } from './model-chain.js';
import type {
  Ai,
  GenerateObjectOptions,
  StreamObjectOptions,
  StreamObjectResult,
  StreamTextOptions,
  StreamTextResult,
} from '../ai.types.js';

/** Gateway free không trả 429 khi quá tải, nó chỉ chậm dần — đã đo một lượt kéo 517 giây. Thiếu hạn này thì worker bị ôm chỗ gần 9 phút. */
const DEFAULT_TIMEOUT_MS = 90_000;

/** Trần ký tự khi in nguyên văn thứ model trả về. */
const LOG_TEXT_LIMIT = 4000;

/** Thấp hơn trần log vì cột này nằm trong database và chứa dữ liệu cá nhân — xem docblock của trường trong `schema.prisma`. */
const DB_TEXT_LIMIT = 2000;

/** Mọi lời gọi model của cả hệ thống đi qua đây. Ba cộng tác viên bên dưới là seam NỘI BỘ, không module nào ngoài file này được dựng chúng. */
@Injectable()
export class AiService implements Ai {
  private readonly logger = new Logger(AiService.name);
  private readonly chain: ModelChain;
  private readonly chainBudgetMs: number;
  private readonly callLog: AiCallLog;
  private readonly models: LanguageModelFactory;
  private readonly structuredOutputsDefault: boolean;

  /** Lõi nào từ chối `response_format` thì CHỈ lõi đó đổi chế độ — một cờ toàn cục sẽ sai với nửa chuỗi dự phòng trộn nhiều lõi. */
  private readonly learnedModes = new Map<string, boolean>();

  constructor(
    catalog: ModelCatalogService,
    prisma: PrismaService,
    config: ConfigService,
  ) {
    this.structuredOutputsDefault =
      config.get<boolean>('ai.structuredOutputs') ?? false;
    this.chainBudgetMs =
      config.get<number>('ai.chainBudgetMs') ?? DEFAULT_CHAIN_BUDGET_MS;
    this.chain = new ModelChain({
      defaultModelId: config.get<string>('ai.modelId') ?? '',
      defaultProviderId: config.get<string>('ai.provider') ?? '',
      fallbackModelIds: config.get<string[]>('ai.fallbackModelIds') ?? [],
      budgetMs: config.get<number>('ai.chainBudgetMs'),
      logger: this.logger,
    });
    this.callLog = new AiCallLog(prisma, this.logger);
    this.models = new LanguageModelFactory(catalog, this.logger);
  }

  /** Sinh dữ liệu có cấu trúc theo schema Zod. Hỏng ở một model thì `ModelChain` quyết định có đi tiếp mắt xích hay không. */
  async generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    return this.chain.run(
      options.modelId,
      (modelId) => this.withFormatFallback({ ...options, modelId }),
      this.chainBudgetMs,
    );
  }

  /** Chế độ ép định dạng thật cho một lời gọi: mặc định của lõi, trừ khi lõi đó đã bị ghi nhận là từ chối. */
  private async modeFor(
    modelId: string | undefined,
  ): Promise<{ providerId: string; mode: boolean }> {
    const { providerId, structuredOutputs } =
      await this.models.structuredOutputModeFor(
        modelId,
        this.structuredOutputsDefault,
      );
    return {
      providerId,
      mode: this.learnedModes.get(providerId) ?? structuredOutputs,
    };
  }

  /** Đổi chế độ ép định dạng nếu gateway từ chối chế độ đang dùng. Thử lại ĐÚNG một lần ở chế độ còn lại. */
  private async withFormatFallback<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    const { providerId, mode: primary } = await this.modeFor(options.modelId);
    try {
      return await this.attempt(options, primary);
    } catch (error) {
      const fallback = !primary;

      if (isResponseFormatUnsupported(error)) {
        this.logger.warn(
          `Lõi ${providerId} không nhận response_format ở chế độ structuredOutputs=${primary}; ` +
            `chuyển sang ${fallback} cho mọi lời gọi sau của lõi này`,
        );
        this.learnedModes.set(providerId, fallback);
        return this.attempt(options, fallback);
      }

      if (!NoObjectGeneratedError.isInstance(error)) throw error;

      this.logger.warn(
        `Model không trả được object ở chế độ structuredOutputs=${primary}; ` +
          `thử lại MỘT lần ở ${fallback}`,
      );
      return this.attempt(options, fallback);
    }
  }

  /** Chế độ `response_format` giữ nguyên system prompt; chế độ bơm prompt thì nối JSON Schema vào cuối. Dựng schema hỏng thì CẢNH BÁO chứ không im lặng. */
  private systemFor<T>(
    options: { system: string; schema: ZodType<T> },
    structuredOutputs: boolean,
  ): string {
    if (structuredOutputs) return options.system;

    const withSchema = schemaInstruction(options.system, options.schema);
    if (withSchema) return withSchema;

    this.logger.warn(
      'Không dựng được JSON Schema để nhắc model; gửi system prompt trần.',
    );
    return options.system;
  }

  /** MỘT lượt gọi trên MỘT model, đã chốt chế độ ép định dạng. Ghi `ai_calls` cho cả nhánh xong lẫn nhánh hỏng. */
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
        system: this.systemFor(options, structuredOutputs),
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
        cachedTokens: result.usage?.inputTokenDetails?.cacheReadTokens,
      });

      return { object: result.object, modelId: id };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const issues = schemaIssues(error);
      const empty = NoObjectGeneratedError.isInstance(error)
        ? error
        : undefined;

      await this.callLog.record({
        context: options.context,
        provider,
        modelId: id,
        ok: false,
        durationMs,
        failureKind: classifyFailure(error),
        errorMessage: errorMessageOf(error, issues),
        inputTokens: empty?.usage?.inputTokens,
        cachedTokens: empty?.usage?.inputTokenDetails?.cacheReadTokens,
        outputTokens: empty?.usage?.outputTokens,
        finishReason: empty?.finishReason,
        responseText: empty?.text
          ? clipMiddle(empty.text, DB_TEXT_LIMIT)
          : undefined,
      });

      if (empty) this.logSchemaFailure(ref, durationMs, empty, issues);
      throw error;
    }
  }

  /** In nguyên văn thứ model trả về: lệch schema mà không thấy chữ nó viết thì không có cách nào biết nó hiểu sai chỗ nào. */
  private logSchemaFailure(
    ref: string,
    durationMs: number,
    error: NoObjectGeneratedError,
    issues: SchemaIssue[],
  ): void {
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

  /** Thử lại trong suốt được là nhờ `beginStream` giữ tới khi có mảnh ĐẦU TIÊN — lúc đó chưa byte nào rời máy chủ. */
  async streamObject<T>(
    options: StreamObjectOptions<T>,
  ): Promise<StreamObjectResult<T>> {
    const { mode: primary } = await this.modeFor(options.modelId);
    try {
      return await this.beginStream(options, primary);
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) throw error;

      const fallback = !primary;
      this.logger.warn(
        `streamObject không phát được mảnh nào ở chế độ structuredOutputs=${primary}; ` +
          `thử lại MỘT lần ở ${fallback}`,
      );
      return this.beginStream(options, fallback);
    }
  }

  /** Giữ lại tới khi có mảnh đầu: model trả văn xuôi thì `partialObjectStream` không phát gì, và lúc đó vẫn còn đường lùi. */
  private async beginStream<T>(
    options: StreamObjectOptions<T>,
    structuredOutputs: boolean,
  ): Promise<StreamObjectResult<T>> {
    const { model, id, provider, ref } = await this.models.create(
      options.modelId,
      structuredOutputs,
    );
    const startedAt = Date.now();

    const result = streamObject({
      model,
      schema: options.schema,
      system: this.systemFor(options, structuredOutputs),
      prompt: options.prompt,
      abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      onFinish: ({ usage, error }) => {
        const empty = NoObjectGeneratedError.isInstance(error)
          ? error
          : undefined;
        const issues = error ? schemaIssues(error) : [];
        void this.callLog.record({
          context: options.context,
          provider,
          modelId: id,
          ok: !error,
          durationMs: Date.now() - startedAt,
          failureKind: error ? classifyFailure(error) : undefined,
          errorMessage: error ? errorMessageOf(error, issues) : undefined,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          cachedTokens: usage?.inputTokenDetails?.cacheReadTokens,
          finishReason: empty?.finishReason,
          responseText: empty?.text
            ? clipMiddle(empty.text, DB_TEXT_LIMIT)
            : undefined,
        });
        this.logger.log(
          `streamObject ${ref} xong sau ${Date.now() - startedAt}ms`,
        );
      },
    });

    const object = result.object;
    void object.catch(() => undefined);

    const partials = result.partialObjectStream[Symbol.asyncIterator]();
    const head = await partials
      .next()
      .catch(
        () => ({ done: true, value: undefined }) as IteratorResult<unknown>,
      );

    if (head.done === true) {
      await object;
      return { modelId: id, partials: emptyStream(), object };
    }

    return {
      modelId: id,
      partials: streamFrom(head.value, partials),
      object,
    };
  }

  /** KHÔNG có chuỗi dự phòng, và đó là chủ đích: token đầu đã rời đi thì trình duyệt đã vẽ nửa câu, không còn đường lùi sang model khác. */
  async streamText(
    options: StreamTextOptions,
  ): Promise<{ modelId: string; result: StreamTextResult }> {
    const { model, id, provider } = await this.models.create(
      options.modelId,
      false,
    );
    const startedAt = Date.now();

    // Ghi ở đây chứ không để người gọi tự ghi: đây là chỗ DUY NHẤT biết provider và số token thật.
    const record = (ok: boolean, extra: Record<string, unknown>) => {
      if (!options.context) return;
      void this.callLog.record({
        context: options.context,
        provider,
        modelId: id,
        ok,
        durationMs: Date.now() - startedAt,
        ...extra,
      });
    };

    return {
      modelId: id,
      result: streamText({
        model,
        system: options.system,
        ...(options.messages
          ? { messages: options.messages }
          : { prompt: options.prompt ?? '' }),
        abortSignal: AbortSignal.timeout(
          options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ),
        onFinish: ({ usage }) =>
          record(true, {
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          }),
        onError: ({ error }) =>
          record(false, {
            failureKind: classifyFailure(error),
            errorMessage: truncateError(error),
          }),
      }),
    };
  }
}
