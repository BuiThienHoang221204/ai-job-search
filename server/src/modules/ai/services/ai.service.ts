import { Injectable, Logger } from '@nestjs/common';
import {
  NoObjectGeneratedError,
  generateObject,
  streamObject,
  streamText,
} from 'ai';
import type { ZodType } from 'zod';
import { PrismaService } from '@/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  classifyFailure,
  formatIssue,
  isResponseFormatUnsupported,
  schemaIssues,
  truncateError,
  type SchemaIssue,
} from '../utils/failure-kind';
import { estimateTokens, markUsed } from '../utils/fast-model-scheduler';
import { errorMessageOf, schemaInstruction } from '../utils/schema-prompt';
import { routeSdkWarnings } from '../utils/sdk-warnings';
import { clipMiddle, emptyStream, streamFrom } from '../utils/stream';
import { AiCallLog } from './ai-call-log';
import { ConcurrencyGate } from '../utils/concurrency-gate';
import { LanguageModelFactory } from './language-model';
import { ModelCatalogService } from './model-catalog.service';
import { DEFAULT_CHAIN_BUDGET_MS, ModelChain } from './model-chain';
import type {
  Ai,
  GenerateObjectOptions,
  StreamObjectOptions,
  StreamObjectResult,
  StreamTextOptions,
  StreamTextResult,
} from '../ai.types';

const DEFAULT_TIMEOUT_MS = 90_000;

const LOG_TEXT_LIMIT = 4000;

const DB_TEXT_LIMIT = 2000;

/** Các cột lỗi của `ai_calls`, chung cho đường stream và không-stream. */
function failureFields(error: unknown, issues: SchemaIssue[]) {
  const empty = NoObjectGeneratedError.isInstance(error) ? error : undefined;
  return {
    failureKind: classifyFailure(error),
    errorMessage: errorMessageOf(error, issues),
    finishReason: empty?.finishReason,
    responseText: empty?.text
      ? clipMiddle(empty.text, DB_TEXT_LIMIT)
      : undefined,
  };
}

@Injectable()
export class AiService implements Ai {
  private readonly logger = new Logger(AiService.name);
  private readonly chain: ModelChain;
  private readonly chainBudgetMs: number;
  private readonly callLog: AiCallLog;
  private readonly models: LanguageModelFactory;
  private readonly gate: ConcurrencyGate;
  private readonly structuredOutputsDefault: boolean;

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
    this.gate = new ConcurrencyGate(
      config.get<Record<string, number | undefined>>('ai.maxConcurrency') ?? {},
    );
    routeSdkWarnings(this.logger);
  }

  async generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    return this.chain.run(
      options.modelId,
      (modelId) => this.withFormatFallback({ ...options, modelId }),
      this.chainBudgetMs,
      options.fallbackModelIds,
    );
  }

  private async modeFor(modelId: string | undefined): Promise<{
    providerId: string;
    mode: boolean;
    switchable: boolean;
    canStream: boolean;
  }> {
    const { providerId, structuredOutputs, honorsResponseFormat, canStream } =
      await this.models.structuredOutputModeFor(
        modelId,
        this.structuredOutputsDefault,
      );
    return {
      providerId,
      mode: this.learnedModes.get(providerId) ?? structuredOutputs,
      switchable: honorsResponseFormat,
      canStream,
    };
  }

  private async withFormatFallback<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    const {
      providerId,
      mode: primary,
      switchable,
    } = await this.modeFor(options.modelId);
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
      if (!switchable) throw error;

      this.logger.warn(
        `Model không trả được object ở chế độ structuredOutputs=${primary}; ` +
          `thử lại MỘT lần ở ${fallback}`,
      );
      return this.attempt(options, fallback);
    }
  }

  /** Chế độ `response_format` giữ nguyên system prompt; chế độ bơm prompt nối JSON Schema vào cuối. */
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

  /** Mở đầu chung: dựng model, ghi lượt dùng cho `fast-model-scheduler`, xin chỗ ở cổng song song. */
  private async open(
    modelId: string | undefined,
    structuredOutputs: boolean,
    jsonStream: boolean,
    estimatedTokens: number,
  ) {
    const created = await this.models.create(
      modelId,
      structuredOutputs,
      jsonStream,
    );
    markUsed(`${created.provider}/${created.id}`, estimatedTokens);
    const release = await this.gate.acquire(created.provider);
    return { ...created, release, startedAt: Date.now() };
  }

  /** MỘT lượt gọi trên MỘT model; ghi `ai_calls` cho cả nhánh xong lẫn nhánh hỏng. */
  private async attempt<T>(
    options: GenerateObjectOptions<T>,
    structuredOutputs: boolean,
  ): Promise<{ object: T; modelId: string }> {
    const {
      model,
      id,
      provider,
      ref,
      defaultMaxOutputTokens,
      release,
      startedAt,
    } = await this.open(
      options.modelId,
      structuredOutputs,
      false,
      estimateTokens(options.system, options.prompt),
    );

    try {
      const result = await generateObject({
        model,
        schema: options.schema,
        system: this.systemFor(options, structuredOutputs),
        prompt: options.prompt,
        maxRetries: options.maxRetries ?? 2,
        ...(defaultMaxOutputTokens
          ? { maxOutputTokens: defaultMaxOutputTokens }
          : {}),
        abortSignal: AbortSignal.timeout(
          options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ),
      }).finally(release);

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
        ...failureFields(error, issues),
        inputTokens: empty?.usage?.inputTokens,
        cachedTokens: empty?.usage?.inputTokenDetails?.cacheReadTokens,
        outputTokens: empty?.usage?.outputTokens,
      });

      if (empty) this.logSchemaFailure(ref, durationMs, empty, issues);
      throw error;
    }
  }

  /** In nguyên văn thứ model trả về khi lệch schema, để biết model hiểu sai chỗ nào. */
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

  async streamObject<T>(
    options: StreamObjectOptions<T>,
  ): Promise<StreamObjectResult<T>> {
    return this.chain.run(
      options.modelId,
      (modelId) => this.streamOnce({ ...options, modelId }),
      this.chainBudgetMs,
      options.fallbackModelIds,
    );
  }

  private async streamOnce<T>(
    options: StreamObjectOptions<T>,
  ): Promise<StreamObjectResult<T>> {
    const {
      mode: primary,
      switchable,
      canStream,
    } = await this.modeFor(options.modelId);

    if (!canStream) return this.withoutStreaming(options, primary);

    try {
      return await this.beginStream(options, primary);
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) throw error;

      if (!switchable) {
        this.logger.warn(
          `streamObject ${options.modelId ?? '(mặc định)'} không phát được mảnh nào; rơi về đường không-stream`,
        );
        return this.withoutStreaming(options, primary);
      }

      const fallback = !primary;
      this.logger.warn(
        `streamObject không phát được mảnh nào ở chế độ structuredOutputs=${primary}; ` +
          `thử lại MỘT lần ở ${fallback}`,
      );
      return this.beginStream(options, fallback);
    }
  }

  private async withoutStreaming<T>(
    options: StreamObjectOptions<T>,
    mode: boolean,
  ): Promise<StreamObjectResult<T>> {
    this.logger.debug(
      'Bỏ qua streaming: lõi không ép được định dạng, và chỉ đường KHÔNG stream mới bóc được JSON khỏi văn xuôi',
    );

    const { object, modelId } = await this.attempt(options, mode);
    return {
      modelId,
      partials: emptyStream(),
      object: Promise.resolve(object),
    };
  }

  /** Giữ tới mảnh đầu tiên: model trả văn xuôi thì vẫn còn đường lùi sang chế độ/model khác. */
  private async beginStream<T>(
    options: StreamObjectOptions<T>,
    structuredOutputs: boolean,
  ): Promise<StreamObjectResult<T>> {
    const {
      model,
      id,
      provider,
      ref,
      defaultMaxOutputTokens,
      release,
      startedAt,
    } = await this.open(
      options.modelId,
      structuredOutputs,
      true,
      estimateTokens(options.system, options.prompt),
    );

    const result = streamObject({
      model,
      schema: options.schema,
      system: this.systemFor(options, structuredOutputs),
      prompt: options.prompt,
      ...(defaultMaxOutputTokens
        ? { maxOutputTokens: defaultMaxOutputTokens }
        : {}),
      abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      onFinish: ({ usage, error }) => {
        release();
        const empty = NoObjectGeneratedError.isInstance(error)
          ? error
          : undefined;
        const issues = error ? schemaIssues(error) : [];
        if (empty) {
          this.logSchemaFailure(ref, Date.now() - startedAt, empty, issues);
        }
        void this.callLog.record({
          context: options.context,
          provider,
          modelId: id,
          ok: !error,
          durationMs: Date.now() - startedAt,
          ...(error ? failureFields(error, issues) : {}),
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          cachedTokens: usage?.inputTokenDetails?.cacheReadTokens,
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

  /** KHÔNG có chuỗi dự phòng: token đầu đã rời đi thì không còn đường lùi sang model khác. */
  async streamText(
    options: StreamTextOptions,
  ): Promise<{ modelId: string; result: StreamTextResult }> {
    const { model, id, provider, release, startedAt } = await this.open(
      options.modelId,
      false,
      false,
      estimateTokens(
        options.system,
        options.prompt ?? JSON.stringify(options.messages ?? []),
      ),
    );

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
        onFinish: ({ usage }) => {
          release();
          record(true, {
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          });
        },
        onError: ({ error }) => {
          release();
          record(false, {
            failureKind: classifyFailure(error),
            errorMessage: truncateError(error),
          });
        },
      }),
    };
  }
}
