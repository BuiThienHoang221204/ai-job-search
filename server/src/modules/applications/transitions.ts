import type { ApplicationStatus } from '../../generated/prisma/enums.js';

/** Ai yêu cầu đổi trạng thái. */
export type TransitionActor = 'user' | 'system';

/** Đơn đã khép lại, không còn chờ hồi âm. */
export const FINAL_STATUSES = [
  'HIRED',
  'REJECTED',
  'NO_RESPONSE',
  'OFFER_DECLINED',
  'WITHDRAWN',
  'EXPIRED',
] as const satisfies readonly ApplicationStatus[];

/** Đơn còn đang chạy. */
export const OPEN_STATUSES = [
  'VIEWED',
  'RANKED',
  'APPLIED',
  'INTERVIEW',
  'OFFER',
] as const satisfies readonly ApplicationStatus[];

/** Hai trạng thái CHỈ người dùng mới được đặt. */
export const USER_DECISION_ONLY = [
  'HIRED',
  'OFFER_DECLINED',
] as const satisfies readonly ApplicationStatus[];

export const isFinal = (status: ApplicationStatus): boolean =>
  (FINAL_STATUSES as readonly ApplicationStatus[]).includes(status);

/** Nhóm hiển thị trên màn hình Lịch sử ứng tuyển. */
export type StatusGroup = 'open' | 'interview' | 'offer' | 'closed';

export const groupOf = (status: ApplicationStatus): StatusGroup => {
  if (status === 'INTERVIEW') return 'interview';
  if (status === 'OFFER') return 'offer';
  return isFinal(status) ? 'closed' : 'open';
};

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
  /**
   * Đơn đã từng ở OFFER hay chưa, suy từ nhật ký sự kiện. Không thể chỉ nhìn
   * `from`: một đơn có thể đi OFFER -> INTERVIEW (thêm vòng) rồi mới HIRED.
   */
  hadOffer: boolean;
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

/** Kiểm tra một lần đổi trạng thái có hợp lệ không. */
export function checkTransition(request: TransitionRequest): TransitionResult {
  const { from, to, actor, hadOffer } = request;

  if (from === to) {
    return { ok: false, reason: `Đơn đã ở trạng thái ${to}` };
  }

  if (
    (USER_DECISION_ONLY as readonly ApplicationStatus[]).includes(to) &&
    actor !== 'user'
  ) {
    return {
      ok: false,
      reason: `Chỉ người dùng mới đặt được trạng thái ${to}. Nhận việc hay từ chối offer là quyết định ngoài đời, hệ thống không được tự suy ra.`,
    };
  }

  if ((to === 'HIRED' || to === 'OFFER_DECLINED') && !hadOffer) {
    return {
      ok: false,
      reason: `Không thể chuyển sang ${to} khi đơn chưa từng ở trạng thái OFFER`,
    };
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
