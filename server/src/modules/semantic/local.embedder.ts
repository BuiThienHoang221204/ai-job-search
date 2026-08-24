import { Injectable, Logger } from '@nestjs/common';
import {
  truncateAndNormalise,
  type Embedding,
  type SemanticIndex,
} from './semantic-index.js';

/**
 * Adapter embedding chạy NGAY TRONG tiến trình, không gọi mạng, không cần khoá.
 *
 * Chọn nó thay `GeminiEmbedder` vì đo ngày 2026-08-24: OpenRouter có 422 model
 * và 0 model embedding, OpenCode cũng vậy — nên đường gateway đang dùng cho mọi
 * lời gọi model khác KHÔNG phục vụ được việc này, và bậc miễn phí của Google là
 * một nhà cung cấp thứ ba phải xin khoá riêng.
 *
 * `q8` chứ không phải `fp32`: đo trên 17 cặp mẫu, bản nén cho kết quả bằng hoặc
 * tốt hơn (chồng lấn 0,193 so với 0,205) trong khi file nhỏ đi 4 lần (266MB so
 * với 1.059MB) và RAM giảm từ 1.445MB xuống 583MB.
 */
const MODEL_ID = 'Xenova/multilingual-e5-base';
const DTYPE = 'q8';

/** Lô lớn hơn không nhanh thêm mà tốn RAM tuyến tính. Đo: 4ms/chuỗi. */
const BATCH = 64;

/**
 * `e5` được huấn luyện với tiền tố phân biệt câu hỏi và tài liệu. Ở đây hai vế
 * ngang hàng nhau nên dùng CÙNG một tiền tố cho cả hai.
 */
const PREFIX = 'query: ';

type Extractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

@Injectable()
export class LocalEmbedder implements SemanticIndex {
  private readonly logger = new Logger(LocalEmbedder.name);
  readonly modelId = `${MODEL_ID}:${DTYPE}`;

  private extractor: Promise<Extractor> | null = null;

  /**
   * Nạp model MỘT lần rồi giữ lại. Lần đầu mất khoảng 33 giây từ cache đĩa và
   * lâu hơn nhiều nếu chưa có file, nên tuyệt đối không nạp lại mỗi lượt gọi.
   */
  private load(): Promise<Extractor> {
    this.extractor ??= (async () => {
      const startedAt = Date.now();
      const { pipeline } = await import('@huggingface/transformers');
      const extractor = (await pipeline('feature-extraction', MODEL_ID, {
        dtype: DTYPE,
      })) as unknown as Extractor;
      this.logger.log(
        `Nạp ${this.modelId} trong ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      );
      return extractor;
    })();
    return this.extractor;
  }

  async embed(texts: string[]): Promise<Embedding[]> {
    if (!texts.length) return [];

    const extractor = await this.load();
    const startedAt = Date.now();
    const vectors: Embedding[] = [];

    for (let i = 0; i < texts.length; i += BATCH) {
      const output = await extractor(
        texts.slice(i, i + BATCH).map((text) => `${PREFIX}${text}`),
        { pooling: 'mean', normalize: true },
      );
      vectors.push(...output.tolist());
    }

    this.logger.log(
      `embed ${texts.length} đoạn văn bản trong ${Date.now() - startedAt}ms`,
    );
    return vectors.map(truncateAndNormalise);
  }
}
