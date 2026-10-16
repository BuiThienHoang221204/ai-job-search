import type { ApplicationStatus } from '@/generated/prisma/enums';

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
