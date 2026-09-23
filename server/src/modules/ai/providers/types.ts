/** Một "lõi" — gateway phục vụ model. Cố ý là DỮ LIỆU chứ không phải class Nest: 146/185 provider của catalog dùng chung một adapter, nên class cho mỗi lõi sẽ là class không có hàm nào. */
export type ProviderDescriptor = {
  /** Khoá trong model catalog, và tiền tố trong `MODEL_FALLBACK_IDS`. */
  id: string;

  /** Tên hiển thị trong log. */
  label: string;

  /** Chỉ dùng để câu báo lỗi nói đúng chỗ cần sửa; giá trị thật do `configuration.ts` đọc. */
  apiKeyEnv: string;

  /** Có mặt vì một lõi đã ĐO được là phân biệt đối xử theo User-Agent. Khai bằng biến môi trường để tắt được mà không phải build lại. */
  userAgentEnv?: string;

  baseURLEnv?: string;

  honorsResponseFormat?: boolean;

  extraHeaders?: Record<string, string>;

  explicitStreamFlag?: boolean;

  /** Đọc MỘT phần tử `data[]` của `GET /models`: gateway có KHAI model này giữ được structured output không. Bỏ trống = gateway không khai gì. */
  declaresStructuredOutput?: (entry: Record<string, unknown>) => boolean;

  /** Danh sách CHẶN, cố ý không phải danh sách cho phép: model chưa đo thì vẫn được thử, model đã biết là hỏng thì không tốn thêm lượt gọi nào. */
  knownNoStructuredOutput?: readonly string[];
};
