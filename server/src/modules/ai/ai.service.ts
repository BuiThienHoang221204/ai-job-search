import { Injectable, Logger } from '@nestjs/common';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { NoObjectGeneratedError, generateObject, streamText } from 'ai';
import type { LanguageModel } from 'ai';
import { z, type ZodType } from 'zod';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import {
  classifyFailure,
  isResponseFormatUnsupported,
  truncateError,
  type FailureKind,
} from './failure-kind.js';
import { ModelCatalogService } from './model-catalog.service.js';

/// Ai gọi và gọi để làm gì. Bắt buộc: không có nó thì nhật ký chỉ cho biết
/// "có lỗi" mà không cho biết tác vụ nào đang hỏng.
export type AiCallContext = {
  /// Tên hàng đợi hoặc tác vụ, ví dụ "match.evaluate".
  purpose: string;
  userId?: string;
};

export type GenerateObjectOptions<T> = {
  schema: ZodType<T>;
  system: string;
  prompt: string;
  context: AiCallContext;
  modelId?: string;
  /// Số lần thử lại khi model trả về JSON sai schema. Model free hay sai định
  /// dạng hơn model trả phí nên mặc định để 2.
  maxRetries?: number;
  /// Hạn thời gian cho MỘT lần gọi, tính bằng mili-giây.
  timeoutMs?: number;
};

/// Gateway free của OpenCode không trả 429 khi bị quá tải - nó chỉ chậm dần.
/// Đã đo được một lần gọi kéo dài 517 giây. Không có hạn này thì một request
/// đồng bộ sẽ treo gần 9 phút, còn job trong hàng đợi sẽ ôm chỗ worker suốt
/// thời gian đó.
const DEFAULT_TIMEOUT_MS = 90_000;

/// Kiểu trả về của streamText không được ai@7 export ra ngoài, nên lấy ngược
/// từ chính hàm đó thay vì khai báo lại.
type StreamTextResult = ReturnType<typeof streamText>;

export type StreamTextOptions = {
  system: string;
  prompt: string;
  modelId?: string;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly catalog: ModelCatalogService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // Chỉ là điểm KHỞI ĐẦU cho việc dò, không phải quyết định cuối cùng:
    // generateObject sẽ tự đổi nếu gateway từ chối.
    this.structuredOutputs =
      config.get<boolean>('ai.structuredOutputs') ?? false;
  }

  /// Ghi lại một lần gọi. KHÔNG bao giờ được làm hỏng lần gọi thật.
  ///
  /// Nhật ký là thứ yếu; nếu ghi thất bại thì chỉ log ra rồi đi tiếp. Ném lỗi
  /// ở đây sẽ biến một sự cố của bảng phụ thành sự cố của cả tính năng.
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

  /// Chế độ đang dùng để ép định dạng đầu ra.
  ///
  /// `true`  - gửi `response_format` kèm JSON schema; API tự ép cấu trúc.
  /// `false` - chế độ `json_object`; schema đi vào prompt, model tự tuân thủ.
  ///
  /// KHÔNG cắm cứng, vì khả năng của gateway ĐỔI THEO THỜI GIAN mà không báo.
  /// Đã chứng kiến cả hai chiều trong cùng một phiên: lúc đầu để `false` thì
  /// model tự bịa cấu trúc và mọi lần gọi đều hỏng, bật `true` mới chạy; ít
  /// lâu sau chính `true` lại nhận "This response_format type is unavailable
  /// now" cho mọi lời gọi. Cắm cứng chiều nào cũng sẽ sai vào một ngày nào đó.
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

  /// Sinh dữ liệu có cấu trúc theo schema Zod.
  ///
  /// Dùng cái này cho mọi thứ sẽ ghi xuống DB. Không bao giờ parse JSON từ
  /// streamText bằng tay: model free thường bao quanh JSON bằng văn xuôi hoặc
  /// rào ```json, còn generateObject sẽ tự ép định dạng và thử lại.
  async generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    try {
      return await this.attempt(options, this.structuredOutputs);
    } catch (error) {
      // Gateway từ chối đúng cơ chế ép định dạng đang dùng. Đổi sang chế độ
      // kia và NHỚ LẠI, để những lời gọi sau không phải trả giá bằng một lần
      // hỏng nữa. Chỉ đổi một lần: nếu chế độ kia cũng hỏng thì ném ra thật.
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

  /// Bơm JSON Schema thẳng vào system prompt.
  ///
  /// Chỉ dùng ở chế độ `json_object`, và là BẮT BUỘC chứ không phải cho chắc.
  /// Ở chế độ đó API không ép cấu trúc, còn system prompt của ta thì rất dài
  /// (cả khung đánh giá lấy từ file skill) nên model bám theo tiêu đề mục
  /// trong đó thay vì theo schema. Đã quan sát đúng hiện tượng: model trả
  /// `eligibility_gate` / `technical_skills_match` trong khi schema đòi
  /// `eligibility` / `technical`, và trả `{cover_letter: "\documentclass..."}`
  /// thay cho các trường có cấu trúc. Nội dung thì tốt, chỉ sai tên trường.
  ///
  /// Đặt ở CUỐI system prompt là có chủ đích: phần gần chỗ sinh chữ nhất có
  /// sức nặng lớn nhất.
  private withSchemaInstruction<T>(system: string, schema: ZodType<T>): string {
    let json: unknown;
    try {
      json = z.toJSONSchema(schema);
    } catch (error) {
      // Không dựng được schema thì vẫn gọi tiếp - mất phần hướng dẫn còn hơn
      // mất cả lời gọi.
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

      // "response did not match schema" một mình không đủ để sửa gì. Ghi lại
      // chính xác văn bản model trả về, vì đó là thứ duy nhất cho biết nên
      // siết schema, đổi mô tả hay bỏ bớt phần nào trong prompt.
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

  /// Stream văn bản cho các màn hình người dùng ngồi chờ (CV, cover letter).
  async streamText(
    options: StreamTextOptions,
  ): Promise<{ modelId: string; result: StreamTextResult }> {
    // streamText trả văn bản tự do nên không cần ép định dạng; truyền false để
    // không gửi response_format lên gateway một cách vô ích.
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
