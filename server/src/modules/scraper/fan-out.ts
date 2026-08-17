/** Hồ sơ tối thiểu cần có để việc chấm điểm còn có nghĩa. */
export const MIN_COMPLETION_TO_SCORE = 30;

/** Số tin mỗi người được AI chấm trong MỘT lần quét. Đây là trần chi phí thật. */
export const PER_USER_LIMIT = 5;

/** Chốt chặn cuối cho một lần quét, phòng khi số người dùng tăng đột biến. */
export const MAX_EVALUATIONS_PER_RUN = 500;

export type ScoreTarget = { userId: string; jobId: string };

export type FanOutJob = {
  id: string;
  /** Tiêu đề + mô tả, dùng để đối chiếu từ khoá. */
  text: string;
};

export type FanOutUser = {
  id: string;
  completion: number;
  /** primarySkills + secondarySkills. */
  skills: string[];
};

export type FanOutInput = {
  /** Các tin VỪA được lưu trong lần quét này. */
  jobs: FanOutJob[];
  users: FanOutUser[];
  /** Cặp (user, job) ĐÃ có kết quả chấm, để không chấm lại. */
  alreadyScored: Iterable<string>;
  perUserLimit?: number;
};

export const pairKey = (userId: string, jobId: string) => `${userId}::${jobId}`;

export type FanOutResult = {
  targets: ScoreTarget[];
  /** Số lượt bị cắt vì chạm hạn ngạch. Phải BÁO ra, không được lặng lẽ cắt. */
  dropped: number;
  skippedThinProfiles: number;
};

/** Số kỹ năng của hồ sơ xuất hiện trong tin. Không phân biệt hoa thường. */
export function keywordOverlap(text: string, skills: string[]): number {
  const haystack = text.toLowerCase();
  const matched = new Set<string>();
  for (const skill of skills) {
    const needle = skill.trim().toLowerCase();
    if (needle.length < 2 || matched.has(needle)) continue;
    if (haystack.includes(needle)) matched.add(needle);
  }
  return matched.size;
}

/**
 * Chọn những cặp (người dùng, công việc) đáng chấm sau một lần quét.
 *
 * Mỗi người lấy top-K tin khớp nhiều từ khoá nhất, rồi PHÁT THEO VÒNG: mọi người
 * nhận lựa chọn số 1 trước, sau đó mới tới số 2. Nhờ vậy chạm trần chung thì ai
 * cũng có vài tin, thay vì vài người đầu lấy hết.
 */
export function planFanOut(input: FanOutInput): FanOutResult {
  const scored = new Set(input.alreadyScored);
  const limit = input.perUserLimit ?? PER_USER_LIMIT;
  const eligible = input.users.filter(
    (user) => user.completion >= MIN_COMPLETION_TO_SCORE,
  );

  const shortlists = eligible.map((user) => ({
    userId: user.id,
    jobIds: input.jobs
      .filter((job) => !scored.has(pairKey(user.id, job.id)))
      .map((job) => ({
        jobId: job.id,
        score: keywordOverlap(job.text, user.skills),
      }))
      .sort((a, b) => b.score - a.score || a.jobId.localeCompare(b.jobId))
      .slice(0, limit)
      .map((candidate) => candidate.jobId),
  }));

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
  };
}
