export type FailureKind = 'SCHEMA' | 'TIMEOUT' | 'UPSTREAM' | 'OTHER';

/// Các lớp lỗi của AI SDK đều đặt `name` thành chuỗi ổn định có tiền tố "AI_".
/// Nhận dạng qua tên thay vì gọi `isInstance` là có chủ đích: file này không
/// phải import package `ai`, mà `ai` v7 là ESM thuần nên jest (chạy CommonJS)
/// không nạp được. Một hàm phân loại thuần cũng không nên phụ thuộc SDK.
const AI_ERROR_NAMES = {
  noObjectGenerated: 'AI_NoObjectGeneratedError',
  apiCall: 'AI_APICallError',
  retry: 'AI_RetryError',
} as const;

/// Lỗi thật thường bị bọc trong RetryError sau khi hết lượt thử lại. Bóc ra
/// trước khi phân loại, nếu không mọi thất bại đều thành OTHER.
const unwrap = (error: unknown): unknown => {
  const wrapped = error as {
    name?: string;
    lastError?: unknown;
    errors?: unknown[];
  };
  if (wrapped?.name !== AI_ERROR_NAMES.retry) return error;
  if (wrapped.lastError) return wrapped.lastError;
  if (Array.isArray(wrapped.errors) && wrapped.errors.length) {
    return wrapped.errors[wrapped.errors.length - 1];
  }
  return error;
};

/// Rút thông báo lỗi từ một giá trị chưa biết kiểu.
///
/// Không dùng thẳng `String(error)`: với một object thường nó cho ra
/// "[object Object]", tức là ném đi đúng cái thông tin cần để phân loại.
const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string') return message;
  }
  return '';
};

/// Phân loại nguyên nhân một lần gọi model thất bại.
///
/// Đây là thông tin có giá trị nhất trong nhật ký: SCHEMA nghĩa là model quá
/// yếu cho tác vụ (siết schema, đổi mô tả, hoặc đổi model mạnh hơn), còn
/// TIMEOUT/UPSTREAM nghĩa là gateway có vấn đề (đổi nhà cung cấp, giảm tải).
/// Hai kết luận đối lập nhau, và gộp chung lại thành "lỗi" thì mất hết.
export function classifyFailure(input: unknown): FailureKind {
  const error = unwrap(input);
  const name = (error as { name?: string })?.name ?? '';
  const message = messageOf(error);

  // SCHEMA được xét TRƯỚC: một lỗi schema có chữ "aborted" trong văn bản model
  // trả về không được xếp nhầm thành sự cố gateway, vì hai kết luận dẫn tới
  // hai hành động ngược nhau.
  if (name === AI_ERROR_NAMES.noObjectGenerated) return 'SCHEMA';
  if (/did not match schema|no object generated/i.test(message))
    return 'SCHEMA';

  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    /aborted due to timeout|operation was aborted/i.test(message)
  ) {
    return 'TIMEOUT';
  }

  if (name === AI_ERROR_NAMES.apiCall) return 'UPSTREAM';
  if (
    /upstream request failed|rate limit|429|50\d\s|service unavailable/i.test(
      message,
    )
  ) {
    return 'UPSTREAM';
  }

  return 'OTHER';
}

/// Gateway có chấp nhận `response_format` kèm JSON schema hay không.
///
/// Khả năng này ĐỔI THEO THỜI GIAN mà không báo trước. Trong cùng một phiên
/// làm việc đã chứng kiến cả hai chiều: lúc đầu không bật `response_format`
/// thì model tự bịa cấu trúc, bật lên mới chạy; ít lâu sau gateway trả
/// "This response_format type is unavailable now" cho đúng cấu hình đó.
///
/// Vì vậy AiService không cắm cứng một chế độ mà dò lấy - hàm này là chỗ nhận
/// ra tín hiệu để đổi chế độ.
export function isResponseFormatUnsupported(input: unknown): boolean {
  return /response_format[^.]{0,40}(unavailable|not supported|unsupported)|unsupported.{0,20}response_format/i.test(
    messageOf(unwrap(input)),
  );
}

/// Cắt bớt thông báo trước khi ghi xuống DB.
///
/// Thông báo lỗi của AI SDK có thể dài vài chục nghìn ký tự vì nó nhét cả
/// response thô vào. Giữ đoạn đầu là đủ để nhận dạng.
export function truncateError(error: unknown, max = 800): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > max ? `${message.slice(0, max)}...` : message;
}
