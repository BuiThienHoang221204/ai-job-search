import { messageOf } from '@/common/error-message';
export type FailureKind = 'SCHEMA' | 'TIMEOUT' | 'UPSTREAM' | 'OTHER';

const AI_ERROR_NAMES = {
  noObjectGenerated: 'AI_NoObjectGeneratedError',
  apiCall: 'AI_APICallError',
  retry: 'AI_RetryError',
} as const;

/** Bóc lỗi thật khỏi RetryError trước khi phân loại, nếu không mọi thất bại đều thành OTHER. */
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

const looseMessageOf = (error: unknown): string => {
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
  const message = looseMessageOf(error);

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

export function isModelRetired(input: unknown): boolean {
  const message = looseMessageOf(unwrap(input));
  return /free promotion has ended|no longer available|subscrib(e|ing) to/i.test(
    message,
  );
}

/** Gateway từ chối vì HẾT HẠN MỨC, không phải vì lỗi. */
export function isRateLimited(input: unknown): boolean {
  const error = unwrap(input);
  const message = looseMessageOf(error);
  const status = (error as { statusCode?: unknown; status?: unknown })
    ?.statusCode;

  if (status === 429) return true;
  return /FreeUsageLimitError|rate limit exceeded|too many requests|429/i.test(
    message,
  );
}

/** Prompt vượt trần token của RIÊNG model này (Groq trả 413 khi vượt TPM), model khác trần lớn hơn vẫn nhận được. */
export function isTooLargeForModel(input: unknown): boolean {
  const error = unwrap(input);
  const status = (error as { statusCode?: unknown })?.statusCode;

  if (status === 413) return true;
  return /request too large|reduce your message size/i.test(
    looseMessageOf(error),
  );
}

export function isAccessDenied(input: unknown): boolean {
  const error = unwrap(input);
  const status = (error as { statusCode?: unknown })?.statusCode;

  if (status === 401 || status === 403) return true;
  if (typeof status === 'number') return false;

  return /\[(401|403)\]|free tier can only be used|is not supported|insufficient_quota|permission_error|unauthorized|forbidden/i.test(
    looseMessageOf(error),
  );
}

export function isTransientUpstream(input: unknown): boolean {
  const error = unwrap(input);
  const status = (error as { statusCode?: unknown })?.statusCode;

  if (typeof status === 'number') return status >= 500;

  return /internal server error|bad gateway|service unavailable|overloaded/i.test(
    looseMessageOf(error),
  );
}

export function isResponseFormatUnsupported(input: unknown): boolean {
  return /response_format[^.]{0,40}(unavailable|not supported|unsupported)|unsupported.{0,20}response_format/i.test(
    looseMessageOf(unwrap(input)),
  );
}

export function truncateError(error: unknown, max = 800): string {
  const message = messageOf(error);
  return message.length > max ? `${message.slice(0, max)}...` : message;
}

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

export const formatIssue = (issue: SchemaIssue): string =>
  `${issue.path}: ${issue.code} — ${issue.message}`;

export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}
