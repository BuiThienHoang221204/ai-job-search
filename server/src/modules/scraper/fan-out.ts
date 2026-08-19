/** Hồ sơ tối thiểu cần có để việc chấm điểm còn có nghĩa. */
export const MIN_COMPLETION_TO_SCORE = 30;

/** Số tin mỗi người được AI chấm trong MỘT lần quét. Đây là trần chi phí thật. */
export const PER_USER_LIMIT = 5;

/** Tin không dính lấy một kỹ năng nào của hồ sơ thì không đáng một lượt gọi model. */
export const MIN_KEYWORD_OVERLAP = 1;

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
  /** Số cặp bị loại vì không dính lấy một kỹ năng nào. Cũng phải BÁO ra. */
  skippedNoOverlap: number;
};

/** Chữ và số của MỌI bảng mã. `\b` của JS chỉ biết ASCII nên vô dụng với tiếng Việt. */
const WORDISH = String.raw`[\p{L}\p{N}]`;

const patterns = new Map<string, RegExp>();

/**
 * Biên từ chỉ áp ở phía mà chính từ khoá kết thúc bằng chữ hoặc số.
 *
 * Nhờ vậy `.NET` vẫn khớp trong "ASP.NET" và `C++` vẫn khớp "C++ developer",
 * còn `Excel` thì KHÔNG khớp "excellence" và `SAP` không khớp "Sapphire".
 */
function patternFor(needle: string): RegExp {
  const cached = patterns.get(needle);
  if (cached) return cached;

  const edge = new RegExp(WORDISH, 'u');
  const left = edge.test(needle[0]) ? `(?<!${WORDISH})` : '';
  const right = edge.test(needle[needle.length - 1]) ? `(?!${WORDISH})` : '';
  const body = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${left}${body}${right}`, 'iu');

  // Kỹ năng là chữ người dùng tự gõ nên tập khoá không có trần tự nhiên.
  if (patterns.size > 2000) patterns.clear();
  patterns.set(needle, pattern);
  return pattern;
}

/**
 * Số kỹ năng của hồ sơ xuất hiện trong tin, khớp theo TỪ chứ không phải chuỗi con.
 *
 * Khớp chuỗi con từng cho `Excel` dính vào "technical excellence" và `SAP` dính
 * vào "Sapphire 2 tower" — mọi tin IT tiếng Anh đều có chữ "excellence", nên
 * mọi hồ sơ phi-IT có khai Excel đều bị ghép với chúng.
 */
export function keywordOverlap(text: string, skills: string[]): number {
  const matched = new Set<string>();
  for (const skill of skills) {
    const needle = skill.trim().toLowerCase();
    if (needle.length < 2 || matched.has(needle)) continue;
    if (patternFor(needle).test(text)) matched.add(needle);
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

  let skippedNoOverlap = 0;

  const shortlists = eligible.map((user) => {
    const ranked = input.jobs
      .filter((job) => !scored.has(pairKey(user.id, job.id)))
      .map((job) => ({
        jobId: job.id,
        score: keywordOverlap(job.text, user.skills),
      }));

    // Không dính kỹ năng nào thì KHÔNG chấm, thay vì lấy top-K của một danh
    // sách toàn số 0 - khi đó thứ hạng do `localeCompare` quyết định, tức là
    // ngẫu nhiên, và mỗi tin lạc ngành tốn đúng một lượt gọi model.
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
