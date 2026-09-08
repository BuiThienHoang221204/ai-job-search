import type { ApplicationStatus } from '../../generated/prisma/enums.js';

/** Ai yêu cầu đổi trạng thái. */
export type TransitionActor = 'user' | 'system';

/** Đơn đã khép lại, không còn chờ hồi âm. */
export const FINAL_STATUSES = [
  'WITHDRAWN',
] as const satisfies readonly ApplicationStatus[];

/** Đơn còn đang chạy. */
export const OPEN_STATUSES = [
  'VIEWED',
  'APPLIED',
] as const satisfies readonly ApplicationStatus[];

export const isFinal = (status: ApplicationStatus): boolean =>
  (FINAL_STATUSES as readonly ApplicationStatus[]).includes(status);

/** Nhóm hiển thị trên màn hình Lịch sử ứng tuyển. */
export type StatusGroup = 'open' | 'closed';

export const groupOf = (status: ApplicationStatus): StatusGroup =>
  isFinal(status) ? 'closed' : 'open';

/** Mọi trạng thái, dựng từ chính hai mảng trên chứ không gõ tay lại. */
export const ALL_STATUSES = [
  ...OPEN_STATUSES,
  ...FINAL_STATUSES,
] as const satisfies readonly ApplicationStatus[];

/**
 * Đảo ngược `groupOf`: những trạng thái nào thuộc một nhóm. Suy ra từ chính
 * `groupOf` nên thêm một trạng thái vào enum là bảng lọc tự đúng theo.
 */
export const statusesOfGroup = (group: StatusGroup): ApplicationStatus[] =>
  (ALL_STATUSES as readonly ApplicationStatus[]).filter(
    (status) => groupOf(status) === group,
  );

export type TransitionRequest = {
  from: ApplicationStatus;
  to: ApplicationStatus;
  actor: TransitionActor;
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

/**
 * Kiểm tra một lần đổi trạng thái có hợp lệ không.
 *
 * Với ba trạng thái thì mọi đường đi đều hợp lý ngoài đời - nộp rồi huỷ, huỷ rồi
 * nộp lại, đánh dấu nhầm rồi sửa - nên chỉ còn hai điều bị chặn: đổi sang chính
 * trạng thái đang có, và HỆ THỐNG tự mở lại một đơn người dùng đã đóng.
 */
export function checkTransition(request: TransitionRequest): TransitionResult {
  const { from, to, actor } = request;

  if (from === to) {
    return { ok: false, reason: `Đơn đã ở trạng thái ${to}` };
  }

  if (isFinal(from) && actor !== 'user') {
    return {
      ok: false,
      reason: `Đơn đã đóng ở trạng thái ${from}; chỉ người dùng mới mở lại được`,
    };
  }

  return { ok: true };
}

/** Mốc thời gian cần ghi kèm khi chuyển sang trạng thái mới. */
export function timestampsFor(
  to: ApplicationStatus,
  current: { appliedAt: Date | null; closedAt: Date | null },
  now: Date,
): { appliedAt: Date | null; closedAt: Date | null } {
  return {
    appliedAt:
      to === 'APPLIED' && !current.appliedAt
        ? now
        : (current.appliedAt ?? null),
    closedAt: isFinal(to) ? now : null,
  };
}
