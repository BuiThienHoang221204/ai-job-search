import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany } from 'ai';
import {
  truncateAndNormalise,
  type Embedding,
  type SemanticIndex,
} from './semantic-index.js';

/**
 * Adapter embedding chạy trên Gemini.
 *
 * **Không cài thêm package nào.** Google có endpoint OpenAI-compatible cho
 * embeddings, nên nó dùng đúng `@ai-sdk/openai-compatible` mà app đã dùng cho
 * mọi lời gọi model khác.
 *
 * Vì sao Gemini chứ không phải gateway đang dùng: đã đo, **OpenCode không có
 * model embedding nào**, và OpenRouter cũng vậy (0/413). Đây không phải hạn chế
 * của tier free mà của cả hai nhà cung cấp đó.
 *
 * Chi phí: free tier khai rõ "Free of charge" cho text. Kể cả trả tiền thì toàn
 * bộ kho 129 tin (~77.000 token) tốn khoảng 1,5 cent — embedding rẻ hơn sinh
 * văn bản cả một bậc.
 */
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const MODEL_ID = 'gemini-embedding-2-preview';

@Injectable()
export class GeminiEmbedder implements SemanticIndex {
  private readonly logger = new Logger(GeminiEmbedder.name);
  readonly modelId = MODEL_ID;

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string {
    const key = this.config.get<string>('semantic.apiKey') ?? '';
    if (!key) {
      throw new Error(
        'Chưa có GEMINI_API_KEY trong .env — không sinh được embedding.',
      );
    }
    return key;
  }

  async embed(texts: string[]): Promise<Embedding[]> {
    if (!texts.length) return [];

    const provider = createOpenAICompatible({
      name: 'google',
      baseURL: BASE_URL,
      apiKey: this.apiKey,
    });

    const startedAt = Date.now();
    const { embeddings } = await embedMany({
      model: provider.textEmbeddingModel(MODEL_ID),
      values: texts,
    });

    this.logger.log(
      `embed ${texts.length} đoạn văn bản trong ${Date.now() - startedAt}ms`,
    );

    // Cắt về 768 chiều và chuẩn hoá TẠI ĐÂY, không để caller nhớ: cột database
    // là vector(768), nên vector sai chiều sẽ hỏng ở tầng SQL với một thông báo
    // khó lần ra hơn nhiều.
    return embeddings.map(truncateAndNormalise);
  }
}
