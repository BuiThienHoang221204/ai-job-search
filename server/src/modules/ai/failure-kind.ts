export type FailureKind = 'SCHEMA' | 'TIMEOUT' | 'UPSTREAM' | 'OTHER';

/** Các lớp lỗi của AI SDK đều đặt `name` thành chuỗi ổn định có tiền tố "AI_". */
const AI_ERROR_NAMES = {
  noObjectGenerated: 'AI_NoObjectGeneratedError',
  apiCall: 'AI_APICallError',
  retry: 'AI_RetryError',
} as const;

/**
 * Lỗi thật thường bị bọc trong RetryError sau khi hết lượt thử lại. Bóc ra
 * trước khi phân loại, nếu không mọi thất bại đều thành OTHER.
 */
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

/** Rút thông báo lỗi từ một giá trị chưa biết kiểu. */
const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string') return message;
  }
  return '';
};

/** Phân loại nguyên nhân một lần gọi model thất bại. */
export function classifyFailure(input: unknown): FailureKind {
  const error = unwrap(input);
  const name = (error as { name?: string })?.name ?? '';
  const message = messageOf(error);

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

  if (isRateLimited(input) || isModelRetired(input)) return 'UPSTREAM';

  if (
    /upstream request failed|rate limit|429|50\d\s|service unavailable/i.test(
      message,
    )
  ) {
    return 'UPSTREAM';
  }

  return 'OTHER';
}

/**
 * Gateway từ chối HẲN model này, chứ không phải từ chối riêng lượt gọi này.
 *
 * Model free bị rút khuyến mãi **vẫn nằm trong `GET /models`**, nên
 * `assertServed()` cho qua và mãi tới lúc gọi thật mới nhận 401 `ModelError:
 * Free promotion has ended`. Đo ngày 2026-08-21 trên `deepseek-v4-flash-free` -
 * mắt xích ĐẦU TIÊN của `MODEL_FALLBACK_IDS`.
 *
 * Không nhận ra tình huống này thì chuỗi dự phòng đứng lại ở đúng mắt xích đã
 * chết thay vì đi tiếp: hết hạn mức ở model chính là cả tác vụ hỏng, dù còn
 * mấy model free khác đang phục vụ bình thường.
 */
export function isModelRetired(input: unknown): boolean {
  const message = messageOf(unwrap(input));
  return /free promotion has ended|no longer available|subscrib(e|ing) to/i.test(
    message,
  );
}

/** Gateway từ chối vì HẾT HẠN MỨC, chứ không phải vì lỗi. */
export function isRateLimited(input: unknown): boolean {
  const error = unwrap(input);
  const message = messageOf(error);
  const status = (error as { statusCode?: unknown; status?: unknown })
    ?.statusCode;

  if (status === 429) return true;
  return /FreeUsageLimitError|rate limit exceeded|too many requests|429/i.test(
    message,
  );
}

/**
 * Lõi đang ỐM, chứ không phải request của ta sai.
 *
 * Đo ngày 2026-08-22 trên `agent.reviewer`: gateway trả 500 hai lần liên tiếp,
 * mỗi lần ~48 giây, trong khi đúng model đó với đúng tool đó chạy xong trong 51
 * giây ở lượt trước. Payload chỉ 8,4KB, xa mức trần - không có gì để sửa ở phía
 * ta, chỉ có một máy chủ đang quá tải.
 *
 * Tách khỏi `classifyFailure` vì hai câu hỏi khác nhau: mọi `AI_APICallError`
 * đều là `UPSTREAM` khi ghi nhật ký, nhưng chỉ 5xx mới đáng đổi sang model
 * khác. Một request 400 thì model nào cũng từ chối, và chạy hết chuỗi dự phòng
 * chỉ là nhân số lần chờ lên sáu.
 */
export function isTransientUpstream(input: unknown): boolean {
  const error = unwrap(input);
  const status = (error as { statusCode?: unknown })?.statusCode;

  // Có mã trạng thái thì tin mã, đừng dò chữ nữa: 400 kèm câu "internal server
  // error" trong thân phản hồi vẫn là lỗi của request, không phải của lõi.
  if (typeof status === 'number') return status >= 500;

  return /internal server error|bad gateway|service unavailable|overloaded/i.test(
    messageOf(error),
  );
}

/** Gateway có chấp nhận `response_format` kèm JSON schema hay không. */
export function isResponseFormatUnsupported(input: unknown): boolean {
  return /response_format[^.]{0,40}(unavailable|not supported|unsupported)|unsupported.{0,20}response_format/i.test(
    messageOf(unwrap(input)),
  );
}

/** Cắt bớt thông báo trước khi ghi xuống DB. */
export function truncateError(error: unknown, max = 800): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > max ? `${message.slice(0, max)}...` : message;
}

/** Một chỗ object của model lệch khỏi schema. */
export type SchemaIssue = { path: string; code: string; message: string };

/** Chi tiết lệch schema mà `NoObjectGeneratedError` giấu ở `cause.cause.issues`. */
export function schemaIssues(input: unknown): SchemaIssue[] {
  const nested = (unwrap(input) as { cause?: { cause?: { issues?: unknown } } })
    ?.cause?.cause?.issues;
  if (!Array.isArray(nested)) return [];

  return nested.map((entry) => {
    const issue = entry as {
      path?: unknown;
      code?: unknown;
      message?: unknown;
    };
    return {
      path:
        Array.isArray(issue.path) && issue.path.length
          ? issue.path.join('.')
          : '(gốc)',
      code: typeof issue.code === 'string' ? issue.code : 'invalid',
      message: typeof issue.message === 'string' ? issue.message : '',
    };
  });
}

/** Một chỗ lệch trên một dòng. Dùng chung cho log và cột `errorMessage`. */
export const formatIssue = (issue: SchemaIssue): string =>
  `${issue.path}: ${issue.code} — ${issue.message}`;
