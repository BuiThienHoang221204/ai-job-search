/** Hồ sơ tối thiểu cần có để việc chấm điểm còn có nghĩa. */
export const MIN_COMPLETION_TO_SCORE = 30;

/** Trần số lượt chấm điểm cho MỘT lần quét của hệ thống. */
export const MAX_EVALUATIONS_PER_RUN = 500;

export type ScoreTarget = { userId: string; jobId: string };

export type FanOutInput = {
  /** Id các tin VỪA được lưu trong lần quét này. */
  newJobIds: string[];
  /** Người dùng có hồ sơ, kèm mức hoàn thiện. */
  users: Array<{ id: string; completion: number }>;
  /** Cặp (user, job) ĐÃ có kết quả chấm, để không chấm lại. */
  alreadyScored: Iterable<string>;
};

export const pairKey = (userId: string, jobId: string) => `${userId}::${jobId}`;

export type FanOutResult = {
  targets: ScoreTarget[];
  /**
   * Số lượt bị cắt vì chạm trần. Phải BÁO ra, không được lặng lẽ cắt: nhìn
   * vào jobsQueued mà không biết đã cắt sẽ tưởng là quét được ít tin.
   */
  dropped: number;
  skippedThinProfiles: number;
};

/** Quyết định cần chấm những cặp (người dùng, công việc) nào sau một lần quét. */
export function planFanOut(input: FanOutInput): FanOutResult {
  const scored = new Set(input.alreadyScored);
  const eligible = input.users.filter(
    (user) => user.completion >= MIN_COMPLETION_TO_SCORE,
  );

  const targets: ScoreTarget[] = [];
  let dropped = 0;

  for (const jobId of input.newJobIds) {
    for (const user of eligible) {
      if (scored.has(pairKey(user.id, jobId))) continue;
      if (targets.length >= MAX_EVALUATIONS_PER_RUN) {
        dropped += 1;
        continue;
      }
      targets.push({ userId: user.id, jobId });
    }
  }

  return {
    targets,
    dropped,
    skippedThinProfiles: input.users.length - eligible.length,
  };
}
