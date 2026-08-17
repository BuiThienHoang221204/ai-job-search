/**
 * Tên hàng đợi, viết bằng chuỗi thay vì tham chiếu `QUEUE` của
 * queue.service.ts: file kia import file này lúc chạy, nên tham chiếu ngược lại
 * sẽ thành phụ thuộc vòng. `queue-key.spec.ts` đối chiếu hai danh sách với nhau
 */
const EVALUATE_MATCH = 'match.evaluate';
const INTERVIEW_PREP = 'interview.prep';
const UPSKILL_REPORT = 'upskill.report';
const GENERATE_DOCUMENT = 'document.generate';
const SCRAPE_RUN = 'scrape.run';
const PROFILE_SYNTHESIZE = 'profile.synthesize';
const APPLY_ASSIST = 'apply.assist';
const EXTRACT_REQUIREMENTS = 'job.requirements';

export const QUEUES_WITH_KEY_RULE = [
  EVALUATE_MATCH,
  INTERVIEW_PREP,
  UPSKILL_REPORT,
  GENERATE_DOCUMENT,
  SCRAPE_RUN,
  PROFILE_SYNTHESIZE,
  APPLY_ASSIST,
  EXTRACT_REQUIREMENTS,
] as const;

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

/** Khoá dedup cho một việc sắp xếp vào hàng đợi. */
export function singletonKeyFor(queue: string, data: object): string {
  switch (queue) {
    /**
     * `force` đi vào khoá: một yêu cầu chấm LẠI không được gộp vào job đang chờ,
     * vì job đó sẽ thấy promptHash không đổi và trả kết quả cache - đúng thứ mà
     * người dùng vừa nói là không muốn.
     */
    case EVALUATE_MATCH:
    case INTERVIEW_PREP:
      return [
        requireField(queue, data, 'userId'),
        requireField(queue, data, 'jobId'),
        isForced(data) ? 'force' : 'cache',
      ].join(':');

    /**
     * Ba hàng đợi dưới đây đã có bản ghi riêng trong database trước khi việc
     * được xếp, nên chính id của bản ghi là khoá tự nhiên: xếp hai lần cho cùng
     * một bản ghi luôn là trùng lặp, không bao giờ là hai việc khác nhau.
     */
    case UPSKILL_REPORT:
      return requireField(queue, data, 'reportId');

    case GENERATE_DOCUMENT:
      return requireField(queue, data, 'documentId');

    case SCRAPE_RUN:
      return requireField(queue, data, 'runId');

    case PROFILE_SYNTHESIZE:
      return requireField(queue, data, 'draftId');

    case APPLY_ASSIST:
      return requireField(queue, data, 'attemptId');

    /** Một tin chỉ cần rút một lần; `force` tách riêng như EVALUATE_MATCH. */
    case EXTRACT_REQUIREMENTS:
      return [
        requireField(queue, data, 'jobId'),
        isForced(data) ? 'force' : 'cache',
      ].join(':');

    default:
      /**
       * KHÔNG có khoá mặc định. Thêm hàng đợi mới thì buộc phải quyết định khoá
       * của nó: đoán sai thì gộp mất việc, còn để trống thì policy `exclusive`
       * coi cả hàng đợi là một khoá và chặn mọi thứ xuống còn một job.
       */
      throw new Error(
        `Hàng đợi "${queue}" chưa khai khoá dedup. Thêm một nhánh vào singletonKeyFor().`,
      );
  }
}
