import { Injectable, Logger } from '@nestjs/common';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { NoObjectGeneratedError, generateObject, streamText } from 'ai';
import type { LanguageModel } from 'ai';
import { z, type ZodType } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import {
  classifyFailure,
  isRateLimited,
  isResponseFormatUnsupported,
  truncateError,
  type FailureKind,
} from './failure-kind.js';
import { ModelCatalogService } from './model-catalog.service.js';

/**
 * Ai gọi và gọi để làm gì. Bắt buộc: không có nó thì nhật ký chỉ cho biết
 * "có lỗi" mà không cho biết tác vụ nào đang hỏng.
 */
export type AiCallContext = {
  /** Tên hàng đợi hoặc tác vụ, ví dụ "match.evaluate". */
  purpose: string;
  userId?: string;
};

export type GenerateObjectOptions<T> = {
  schema: ZodType<T>;
  system: string;
  prompt: string;
  context: AiCallContext;
  modelId?: string;
  /**
   * Số lần thử lại khi model trả về JSON sai schema. Model free hay sai định
   * dạng hơn model trả phí nên mặc định để 2.
   */
  maxRetries?: number;
  /** Hạn thời gian cho MỘT lần gọi, tính bằng mili-giây. */
  timeoutMs?: number;
};

/**
 * Gateway free của OpenCode không trả 429 khi bị quá tải - nó chỉ chậm dần.
 * Đã đo được một lần gọi kéo dài 517 giây. Không có hạn này thì một request
 * đồng bộ sẽ treo gần 9 phút, còn job trong hàng đợi sẽ ôm chỗ worker suốt
 */
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Kiểu trả về của streamText không được ai@7 export ra ngoài, nên lấy ngược
 * từ chính hàm đó thay vì khai báo lại.
 */
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

  /** Các model thử tiếp khi model đang dùng HẾT HẠN MỨC. Xem `configuration.ts`. */
  private readonly fallbackModelIds: string[];

  constructor(
    private readonly catalog: ModelCatalogService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.structuredOutputs =
      config.get<boolean>('ai.structuredOutputs') ?? false;
    this.fallbackModelIds = config.get<string[]>('ai.fallbackModelIds') ?? [];
  }

  /** Thứ tự model sẽ thử cho MỘT lời gọi. */
  private modelChain(requested?: string): Array<string | undefined> {
    const chain: Array<string | undefined> = [requested];
    for (const id of this.fallbackModelIds) {
      if (id !== requested) chain.push(id);
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

  private async languageModel(
    modelId: string | undefined,
    structuredOutputs: boolean,
  ): Promise<{ model: LanguageModel; id: string; provider: string }> {
    const resolved = await this.catalog.resolve(modelId);
    const provider = createOpenAICompatible({
      name: resolved.providerId,
      baseURL: resolved.baseURL,
      apiKey: resolved.apiKey,
      supportsStructuredOutputs: structuredOutputs,
    });
    return {
      model: provider(resolved.model.id),
      id: resolved.model.id,
      provider: resolved.providerId,
    };
  }

  /** Sinh dữ liệu có cấu trúc theo schema Zod. */
  async generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    const chain = this.modelChain(options.modelId);
    let lastRateLimit: unknown;

    for (const [index, modelId] of chain.entries()) {
      try {
        return await this.withFormatFallback({ ...options, modelId });
      } catch (error) {
        if (!isRateLimited(error)) throw error;

        lastRateLimit = error;
        const next = chain[index + 1];
        this.logger.warn(
          next
            ? `Model ${modelId ?? '(mặc định)'} hết hạn mức, thử ${next}`
            : `Model ${modelId ?? '(mặc định)'} hết hạn mức và không còn model dự phòng`,
        );
      }
    }

    throw lastRateLimit;
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
    const { model, id, provider } = await this.languageModel(
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
      this.logger.log(`generateObject ${id} xong sau ${durationMs}ms`);

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
            `generateObject ${id} thất bại sau ${durationMs}ms`,
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
