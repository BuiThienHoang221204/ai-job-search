import type { ApplicationStatus } from '@/generated/prisma/enums';

export type TransitionActor = 'user' | 'system';

export const FINAL_STATUSES = [
  'WITHDRAWN',
] as const satisfies readonly ApplicationStatus[];

export const OPEN_STATUSES = [
  'VIEWED',
  'APPLIED',
] as const satisfies readonly ApplicationStatus[];

export const isFinal = (status: ApplicationStatus): boolean =>
  (FINAL_STATUSES as readonly ApplicationStatus[]).includes(status);

export const ALL_STATUSES = [
  ...OPEN_STATUSES,
  ...FINAL_STATUSES,
] as const satisfies readonly ApplicationStatus[];

export type TransitionRequest = {
  from: ApplicationStatus;
  to: ApplicationStatus;
  actor: TransitionActor;
};

export type TransitionResult = { ok: true } | { ok: false; reason: string };

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
