import {
  EMBEDDING_DIM,
  truncateAndNormalise,
  type Embedding,
  type SemanticIndex,
} from '../modules/semantic/semantic-index.js';

export const FAKE_EMBEDDING_MODEL = 'fake-embedder';

/**
 * Bản giả của `SemanticIndex` cho test: không mạng, không tiền, không chờ.
 *
 * Vector sinh ra là **tất định theo nội dung văn bản** chứ không ngẫu nhiên, và
 * đó là điểm chính: hai đoạn giống nhau cho ra hai vector giống hệt, hai đoạn
 * khác nhau cho ra hai vector khác nhau. Nhờ vậy test khẳng định được "tin này
 * gần hồ sơ hơn tin kia" mà không cần model thật.
 *
 * Nó KHÔNG mô phỏng ngữ nghĩa. Đừng viết test kiểu "kế toán phải gần ngân hàng
 * hơn lập trình" — bản giả này không biết điều đó, và một test như vậy sẽ đo
 * chính hàm băm chứ không đo hệ thống.
 */
export class FakeSemanticIndex implements SemanticIndex {
  readonly modelId = FAKE_EMBEDDING_MODEL;

  /** Nhật ký mọi lần gọi, để test khẳng định được đã gộp lô đúng cách. */
  readonly calls: string[][] = [];

  async embed(texts: string[]): Promise<Embedding[]> {
    await Promise.resolve();
    this.calls.push([...texts]);
    return texts.map((text) => this.vectorFor(text));
  }

  /** Băm chuỗi thành một vector ổn định. */
  private vectorFor(text: string): Embedding {
    const raw = new Array<number>(EMBEDDING_DIM);
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) % 2147483647;
    }
    // Bộ sinh tuyến tính đồng dư: đủ để cho ra vector khác nhau một cách ổn
    // định, và không kéo thêm phụ thuộc nào vào bộ test.
    let state = seed || 1;
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      state = (state * 48271) % 2147483647;
      raw[i] = state / 2147483647 - 0.5;
    }
    return truncateAndNormalise(raw);
  }
}
