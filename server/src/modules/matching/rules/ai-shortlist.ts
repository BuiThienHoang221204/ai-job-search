import type {
  ShortlistCandidate,
  ShortlistInput,
  ShortlistPlan,
  ShortlistRow,
  ShortlistTarget,
} from './types.js';

export const AI_TOP_N = 3;

export const MAX_SHORTLIST_PER_RUN = 300;

export const COOLDOWN_HOURS = 6;

/** Ai lâu chưa được phát suất thì lên trước — `null` coi như lâu nhất. */
const olderFirst = (a: ShortlistCandidate, b: ShortlistCandidate): number => {
  const left = a.lastFanOutAt?.getTime() ?? 0;
  const right = b.lastFanOutAt?.getTime() ?? 0;
  if (left !== right) return left - right;
  return a.userId.localeCompare(b.userId);
};

/** Gom tin theo user, mỗi user giữ tối đa `topN` tin. */
export function groupByUser(
  rows: ShortlistRow[],
  lastFanOutAt: Map<string, Date | null>,
  topN: number,
): ShortlistCandidate[] {
  const byUser = new Map<string, string[]>();

  for (const row of rows) {
    const jobIds = byUser.get(row.userId);
    if (jobIds) {
      if (jobIds.length < topN) jobIds.push(row.jobId);
      continue;
    }
    byUser.set(row.userId, [row.jobId]);
  }

  return [...byUser.entries()]
    .map(([userId, jobIds]) => ({
      userId,
      jobIds,
      lastFanOutAt: lastFanOutAt.get(userId) ?? null,
    }))
    .sort(olderFirst);
}

/** Phát THEO VÒNG: mọi người nhận lựa chọn số 1 trước rồi mới tới số 2, nên chạm trần `MAX_SHORTLIST_PER_RUN` thì ai cũng có vài tin thay vì vài người lấy hết. */
export function planShortlist(input: ShortlistInput): ShortlistPlan {
  const topN = input.topN ?? AI_TOP_N;
  const maxPerRun = input.maxPerRun ?? MAX_SHORTLIST_PER_RUN;
  const candidates = groupByUser(input.rows, input.lastFanOutAt, topN);

  const targets: ShortlistTarget[] = [];
  const served = new Set<string>();
  let cut = false;

  for (let position = 0; position < topN && !cut; position += 1) {
    for (const candidate of candidates) {
      const jobId = candidate.jobIds[position];
      if (jobId === undefined) continue;
      if (targets.length >= maxPerRun) {
        cut = true;
        break;
      }
      targets.push({ userId: candidate.userId, jobId });
      served.add(candidate.userId);
    }
  }

  return {
    targets,
    served: [...served],
    deferred: candidates.filter((row) => !served.has(row.userId)).length,
  };
}
