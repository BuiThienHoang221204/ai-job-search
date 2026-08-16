/**
 * Một "lõi" — gateway phục vụ model. Mỗi lõi một file trong thư mục này; thêm
 * lõi mới là thêm một file rồi khai một dòng trong `index.ts`.
 *
 * Cố ý là DỮ LIỆU chứ không phải class Nest. Đã đo: trong 185 provider của
 * catalog, 146 cái dùng chung đúng một adapter (`@ai-sdk/openai-compatible`),
 * nên giữa chúng chỉ khác nhau baseURL, tên biến chứa key, và cách biết một
 * model làm được gì. Một class cho mỗi lõi sẽ là một class không có hàm nào.
 */
export type ProviderDescriptor = {
  /** Khoá trong model catalog, và tiền tố trong `MODEL_FALLBACK_IDS`. */
  id: string;

  /** Tên hiển thị trong log. */
  label: string;

  /**
   * Tên biến môi trường chứa API key. Chỉ dùng để câu báo lỗi nói đúng chỗ cần
   * sửa; giá trị thật do `configuration.ts` đọc.
   */
  apiKeyEnv: string;

  /**
   * Đọc MỘT phần tử `data[]` của `GET /models`: gateway có KHAI là model này
   * giữ được structured output không. Bỏ trống nghĩa là gateway không khai gì,
   * và khi đó chỉ `knownNoStructuredOutput` mới biết.
   */
  declaresStructuredOutput?: (entry: Record<string, unknown>) => boolean;

  /**
   * Model đã ĐO là không giữ nổi structured output. Đây là danh sách CHẶN, cố ý
   * không phải danh sách cho phép: model chưa đo thì vẫn được thử, còn model đã
   * biết là hỏng thì không bao giờ tốn thêm một lượt gọi nào nữa.
   */
  knownNoStructuredOutput?: readonly string[];
};
