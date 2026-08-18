import { Injectable, Logger } from '@nestjs/common';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { NoObjectGeneratedError, generateObject, streamText } from 'ai';
import type { LanguageModel } from 'ai';
import { z, type ZodType } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import {
  classifyFailure,
  isRateLimited,
  isResponseFormatUnsupported,
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

type StreamTextResult = ReturnType<typeof streamText>;

export type StreamTextOptions = {
  system: string;
  prompt: string;
  modelId?: string;
};

/** Mặt tiếp xúc mà các module khác dùng để gọi model. */
export type Ai = Pick<AiService, 'generateObject'>;

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
    const provider = createOpenAICompatible({
      name: resolved.providerId,
      baseURL: resolved.baseURL,
      apiKey: resolved.apiKey,
      supportsStructuredOutputs: structuredOutputs,
      headers: resolved.headers,
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
    const chain = this.modelChain(options.modelId);
    let lastSkipped: unknown;

    for (const [index, modelId] of chain.entries()) {
      try {
        return await this.withFormatFallback({ ...options, modelId });
      } catch (error) {
        const unavailable = error instanceof ModelUnavailableError;
        if (!unavailable && !isRateLimited(error)) throw error;

        lastSkipped = error;
        const reason = unavailable ? error.message : 'hết hạn mức';
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

      await this.record({
        context: options.context,
        provider,
        modelId: id,
        ok: false,
        durationMs,
        failureKind: classifyFailure(error),
        errorMessage: truncateError(error),
      });

      if (NoObjectGeneratedError.isInstance(error)) {
        this.logger.error(
          [
            `generateObject ${ref} thất bại sau ${durationMs}ms`,
            `finishReason=${error.finishReason} outputTokens=${error.usage?.outputTokens}`,
            `--- model trả về ---`,
            (error.text ?? '(rỗng)').slice(0, 4000),
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
