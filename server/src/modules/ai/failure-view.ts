import { classifyFailure, type FailureKind } from './failure-kind.js';

/**
 * Đổi chuỗi lỗi THÔ thành phân loại, trước khi trả cho người dùng cuối.
 *
 * Vì sao cần: các bảng kết quả (`interview_preps`, `upskill_reports`) lưu nguyên
 * văn thông báo của SDK vào cột `error` — đúng cho việc vận hành, nhưng đường đọc
 * lại trả nguyên chuỗi đó ra giao diện, nên người dùng đọc được đúng thứ này trên
 * màn Chuẩn bị phỏng vấn:
 *
 *   "Failed after 3 attempts. Last error: AI_APICallError: Error from provider
 *    (Console): Rate limit exceeded. Please try again later."
 *
 * Hai vấn đề riêng biệt. Một, người dùng không làm gì được với "AI_APICallError"
 * — họ cần biết nên chờ rồi thử lại, hay đây là lỗi phải báo. Hai, nó phơi ra chi
 * tiết bên trong: tên nhà cung cấp, số lần đã thử, tên lớp lỗi.
 *
 * Nguyên văn KHÔNG mất đi: nó vẫn ở cột `error` và ở bảng `ai_calls`, và màn
 * quản trị `GET /api/admin/ai-failures` vẫn hiện đủ cho người vận hành. Chỉ
 * đường của người dùng thường là không thấy.
 *
 * Câu chữ tiếng Việt CỐ Ý không nằm ở đây: backend nói "chuyện gì đã xảy ra"
 * (`failureKind`), còn giao diện nói "người dùng nên làm gì" — đó là hai nghề
 * khác nhau, và trộn chúng lại thì mỗi lần đổi một câu tiếng Việt lại phải
 * deploy backend.
 */
export function withFailureKind<
  T extends { error?: string | null; status?: unknown },
>(row: T): Omit<T, 'error'> & { failureKind: FailureKind | null } {
  const { error, ...rest } = row;
  return {
    ...rest,
    failureKind: error ? classifyFailure(error) : null,
  };
}

/** Dạng danh sách của `withFailureKind`. */
export function withFailureKinds<
  T extends { error?: string | null; status?: unknown },
>(rows: T[]): Array<Omit<T, 'error'> & { failureKind: FailureKind | null }> {
  return rows.map(withFailureKind);
}
