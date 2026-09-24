import { createHash } from 'node:crypto';
import { QUEUE } from './queue.constants.js';

/** Đọc một trường chuỗi bắt buộc từ payload. */
function requireField(queue: string, data: object, field: string): string {
  const value = (data as Record<string, unknown>)[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Payload của hàng đợi "${queue}" thiếu trường chuỗi "${field}", không dựng được khoá dedup.`,
    );
  }
  return value;
}

function isForced(data: object): boolean {
  return (data as { force?: unknown }).force === true;
}

/** Vân tay của cả lô. Băm thay vì nối chuỗi: năm cuid nối lại dài hơn cột `singleton_key` của pg-boss. */
function batchFingerprint(queue: string, data: object): string {
  const ids = (data as { jobIds?: unknown }).jobIds;
  if (!Array.isArray(ids) || !ids.length) {
    throw new Error(
      `Payload của hàng đợi "${queue}" thiếu mảng "jobIds", không dựng được khoá dedup.`,
    );
  }
  return createHash('sha256')
    .update(
      ids
        .map((id) => String(id))
        .sort()
        .join(','),
    )
    .digest('hex')
    .slice(0, 32);
}

/** Ba hình dạng payload, ba khoá. `round` phải vào khoá vì lượt quét kho tự xếp lượt kế TRƯỚC khi nó kết thúc. */
function scopeKey(queue: string, data: object): string {
  const payload = data as {
    round?: unknown;
    jobId?: unknown;
    userId?: unknown;
  };
  if (typeof payload.round === 'number') return `sweep:${payload.round}`;
  if (payload.jobId) return `job:${requireField(queue, data, 'jobId')}`;
  if (payload.userId) return `user:${requireField(queue, data, 'userId')}`;
  return 'all';
}

/** Khoá dedup cho một việc sắp xếp vào hàng đợi. Suy ra từ payload, người gọi không truyền vào được. */
export function singletonKeyFor(queue: string, data: object): string {
  switch (queue) {
    /** `force` đi vào khoá: yêu cầu chấm LẠI không được gộp vào job đang chờ, vì job đó sẽ trả kết quả cache. */
    case QUEUE.EVALUATE_MATCH:
    case QUEUE.INTERVIEW_PREP:
      return [
        requireField(queue, data, 'userId'),
        requireField(queue, data, 'jobId'),
        isForced(data) ? 'force' : 'cache',
      ].join(':');

    /** Bốn hàng đợi dưới đã có bản ghi riêng trước khi việc được xếp, nên id của bản ghi là khoá tự nhiên. */
    case QUEUE.UPSKILL_REPORT:
      return requireField(queue, data, 'reportId');

    case QUEUE.GENERATE_DOCUMENT:
      return requireField(queue, data, 'documentId');

    case QUEUE.SCRAPE_RUN:
      return requireField(queue, data, 'runId');

    case QUEUE.PROFILE_SYNTHESIZE:
      return requireField(queue, data, 'draftId');

    /** Khoá theo CÔNG TY, không theo người dùng: hai người mở cùng một tin thì lượt sau gộp vào lượt đầu. */
    case QUEUE.COMPANY_BRIEF:
      return [
        requireField(queue, data, 'nameKey'),
        isForced(data) ? 'force' : 'cache',
      ].join(':');

    /** Rút trích đi theo LÔ — hai lô khác nhau chứa chung một tin thì không dedup được, và `extractMany` so `sourceHash` nên chỉ tốn một lượt đọc. */
    case QUEUE.EXTRACT_REQUIREMENTS:
      return [
        batchFingerprint(queue, data),
        isForced(data) ? 'force' : 'cache',
      ].join(':');

    /** Khoá riêng cho từng phía: tính lại theo tin và tính lại theo hồ sơ là hai việc khác nhau, gộp là mất một. */
    case QUEUE.SKILL_CANONICALIZE:
    case QUEUE.REQUIREMENT_MATCH:
      return scopeKey(queue, data);

    case QUEUE.AI_SHORTLIST:
      return (data as { userId?: unknown }).userId
        ? `user:${requireField(queue, data, 'userId')}`
        : 'all';

    /** KHÔNG có khoá mặc định: để trống thì policy `exclusive` coi cả hàng đợi là một khoá và chặn mọi thứ xuống một job. */
    default:
      throw new Error(
        `Hàng đợi "${queue}" chưa khai khoá dedup. Thêm một nhánh vào singletonKeyFor().`,
      );
  }
}
