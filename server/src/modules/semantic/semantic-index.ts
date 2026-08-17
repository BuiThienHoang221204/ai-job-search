/**
 * SEAM 4 · `SemanticIndex` — biến văn bản thành vector để LỌC SƠ BỘ.
 *
 * Nó KHÔNG chấm điểm. Model vẫn là thứ quyết định điểm phù hợp; vector chỉ trả
 * lời câu "tin nào đáng đưa cho model xem". Đó là lý do interface này nhỏ đến
 * mức chỉ có một hàm: mọi thứ khác là việc của `SemanticService`.
 *
 * Vì sao là seam chứ không gọi thẳng: `LO-TRINH.md` mục 4.1 để ngỏ hai đường
 * cho Pha 4 — một nhà cung cấp riêng cho embedding, hoặc bỏ vector search. Cả
 * hai đều nằm sau interface này, nên đổi hướng không ảnh hưởng caller.
 */
export type Embedding = number[];

/**
 * Số chiều lưu trong database. Cột là `vector(768)` nên mọi vector đưa vào PHẢI
 * đúng 768.
 *
 * Chọn 768 thay vì 3072: `gemini-embedding-2` huấn luyện theo kiểu Matryoshka,
 * nghĩa là 768 chiều đầu tiên tự nó đã là một biểu diễn dùng được — cắt bớt gần
 * như không mất chất lượng, mà index nhỏ đi 4 lần.
 */
export const EMBEDDING_DIM = 768;

export interface SemanticIndex {
  /** Model sinh ra vector. Lưu kèm để đổi model không lẫn vector cũ với mới. */
  readonly modelId: string;

  /**
   * Sinh vector cho NHIỀU đoạn văn bản trong một lượt gọi.
   *
   * Nhận mảng chứ không nhận từng cái: 129 tin gọi riêng lẻ là 129 request, còn
   * gộp lô thì gần như luôn nằm gọn trong hạn mức free. Thứ tự trả về phải khớp
   * thứ tự đầu vào.
   */
  embed(texts: string[]): Promise<Embedding[]>;
}

/** Token DI. `SemanticIndex` là interface nên không tự làm token được. */
export const SEMANTIC_INDEX = Symbol('SemanticIndex');

/**
 * Cắt về `EMBEDDING_DIM` rồi chuẩn hoá lại độ dài 1.
 *
 * Hai việc, và việc thứ hai mới là chỗ dễ quên: cắt bớt chiều làm vector không
 * còn dài 1 nữa, mà `vector_cosine_ops` so theo góc — sai độ dài thì khoảng
 * cách tính ra vẫn có vẻ hợp lý nhưng không so được giữa các vector cắt khác
 * nhau. Chuẩn hoá lại là bắt buộc, không phải làm cho đẹp.
 */
export function truncateAndNormalise(raw: Embedding): Embedding {
  const cut = raw.slice(0, EMBEDDING_DIM);
  if (cut.length < EMBEDDING_DIM) {
    throw new Error(
      `Vector chỉ có ${cut.length} chiều, cần ít nhất ${EMBEDDING_DIM}.`,
    );
  }

  const norm = Math.sqrt(cut.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return cut;
  return cut.map((value) => value / norm);
}
