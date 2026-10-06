import type { FanOutInput, FanOutResult, ScoreTarget } from '../types';
import { countTerms } from '@/common/text/vietnamese';
import {
  MIN_COMPLETION_TO_SCORE,
  pairKey,
} from '@/modules/matching/rules/match-write';

export const PER_USER_LIMIT = 5;

export const MIN_KEYWORD_OVERLAP = 1;

export const MAX_EVALUATIONS_PER_RUN = 500;

export function planFanOut(input: FanOutInput): FanOutResult {
  const scored = new Set(input.alreadyScored);
  const limit = input.perUserLimit ?? PER_USER_LIMIT;
  const eligible = input.users.filter(
    (user) => user.completion >= MIN_COMPLETION_TO_SCORE,
  );

  let skippedNoOverlap = 0;

  const shortlists = eligible.map((user) => {
    const ranked = input.jobs
      .filter((job) => !scored.has(pairKey(user.id, job.id)))
      .map((job) => ({
        jobId: job.id,
        score: countTerms(job.text, user.skills),
      }));

    const worth = ranked.filter(
      (candidate) => candidate.score >= MIN_KEYWORD_OVERLAP,
    );
    skippedNoOverlap += ranked.length - worth.length;

    return {
      userId: user.id,
      jobIds: worth
        .sort((a, b) => b.score - a.score || a.jobId.localeCompare(b.jobId))
        .slice(0, limit)
        .map((candidate) => candidate.jobId),
    };
  });

  const targets: ScoreTarget[] = [];
  let dropped = 0;

  for (let rank = 0; rank < limit; rank += 1) {
    for (const list of shortlists) {
      const jobId = list.jobIds[rank];
      if (jobId === undefined) continue;
      if (targets.length >= MAX_EVALUATIONS_PER_RUN) {
        dropped += 1;
        continue;
      }
      targets.push({ userId: list.userId, jobId });
    }
  }

  return {
    targets,
    dropped,
    skippedThinProfiles: input.users.length - eligible.length,
    skippedNoOverlap,
  };
}

export function fanOutSummary(
  plan: FanOutResult,
  queued: number,
  servedUsers: number,
  totalUsers: number,
): string {
  return (
    `Xếp hàng ${queued}/${plan.targets.length} lượt chấm cho ${servedUsers}/${totalUsers} hồ sơ` +
    (plan.dropped ? `; BỎ ${plan.dropped} lượt ngoài hạn ngạch` : '') +
    (plan.skippedThinProfiles
      ? `; bỏ qua ${plan.skippedThinProfiles} hồ sơ quá sơ sài`
      : '') +
    (plan.skippedNoOverlap
      ? `; bỏ ${plan.skippedNoOverlap} cặp không khớp kỹ năng nào`
      : '')
  );
}
