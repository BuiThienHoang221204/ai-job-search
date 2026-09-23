import type { FanOutInput, FanOutResult, ScoreTarget } from '../types.js';
import { countTerms } from '../../../common/text/vietnamese.js';
import {
  MIN_COMPLETION_TO_SCORE,
  pairKey,
} from '../../matching/rules/match-write.js';

/** Số tin mỗi người được AI chấm trong MỘT lần quét. Đây là trần chi phí thật. */
export const PER_USER_LIMIT = 5;

/** Tin không dính lấy một kỹ năng nào của hồ sơ thì không đáng một lượt gọi model. */
export const MIN_KEYWORD_OVERLAP = 1;

/** Chốt chặn cuối cho một lần quét, phòng khi số người dùng tăng đột biến. */
export const MAX_EVALUATIONS_PER_RUN = 500;

/** Top-K theo từ khoá rồi PHÁT THEO VÒNG: chạm trần chung thì ai cũng có vài tin, thay vì vài người đầu lấy hết. */
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

    // Danh sách toàn số 0 thì thứ hạng do `localeCompare` quyết định — ngẫu nhiên, mà mỗi tin lạc ngành tốn một lượt gọi model.
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

/** Ba con số bị cắt phải BÁO ra, không được lặng lẽ biến mất khỏi log. */
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
