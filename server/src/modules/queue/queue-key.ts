import { fingerprint } from '@/common/fingerprint';
import { QUEUE } from './queue.constants';

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

function batchFingerprint(queue: string, data: object): string {
  const ids = (data as { jobIds?: unknown }).jobIds;
  if (!Array.isArray(ids) || !ids.length) {
    throw new Error(
      `Payload của hàng đợi "${queue}" thiếu mảng "jobIds", không dựng được khoá dedup.`,
    );
  }
  return fingerprint([
    ids
      .map((id) => String(id))
      .sort()
      .join(','),
  ]);
}

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

/** Khoá dedup suy ra từ payload; hàng đợi mới phải thêm nhánh, không có khoá mặc định. */
export function singletonKeyFor(queue: string, data: object): string {
  switch (queue) {
    case QUEUE.EVALUATE_MATCH:
    case QUEUE.INTERVIEW_PREP:
      return [
        requireField(queue, data, 'userId'),
        requireField(queue, data, 'jobId'),
        isForced(data) ? 'force' : 'cache',
      ].join(':');

    case QUEUE.UPSKILL_REPORT:
      return requireField(queue, data, 'reportId');

    case QUEUE.GENERATE_DOCUMENT:
      return requireField(queue, data, 'documentId');

    case QUEUE.SCRAPE_RUN:
      return requireField(queue, data, 'runId');

    case QUEUE.PROFILE_SYNTHESIZE:
      return requireField(queue, data, 'draftId');

    case QUEUE.COMPANY_BRIEF:
      return [
        requireField(queue, data, 'nameKey'),
        isForced(data) ? 'force' : 'cache',
      ].join(':');

    case QUEUE.EXTRACT_REQUIREMENTS:
      return [
        batchFingerprint(queue, data),
        isForced(data) ? 'force' : 'cache',
      ].join(':');

    case QUEUE.SKILL_CANONICALIZE:
    case QUEUE.REQUIREMENT_MATCH:
      return scopeKey(queue, data);

    case QUEUE.AI_SHORTLIST:
      return (data as { userId?: unknown }).userId
        ? `user:${requireField(queue, data, 'userId')}`
        : 'all';

    default:
      throw new Error(
        `Hàng đợi "${queue}" chưa khai khoá dedup. Thêm một nhánh vào singletonKeyFor().`,
      );
  }
}
