import type {
  ShortlistCandidate,
  ShortlistInput,
  ShortlistPlan,
  ShortlistRow,
  ShortlistTarget,
} from './types';

const olderFirst = (a: ShortlistCandidate, b: ShortlistCandidate): number => {
  const left = a.lastFanOutAt?.getTime() ?? 0;
  const right = b.lastFanOutAt?.getTime() ?? 0;
  if (left !== right) return left - right;
  return a.userId.localeCompare(b.userId);
};

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

export function planShortlist(input: ShortlistInput): ShortlistPlan {
  const { topN, maxPerRun } = input;
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
