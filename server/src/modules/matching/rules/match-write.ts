import type {
  JobRequirement,
  Prisma,
} from '../../../generated/prisma/client.js';
import { toMatchProfile, toRequirements } from '../ai/utils/requirements.js';
import { matchRequirements } from './requirement-match.js';
import type { Candidate, SkillDictionary } from './types.js';

/** Hồ sơ tối thiểu cần có để việc chấm điểm còn có nghĩa — cùng câu hỏi với `profileSelect`/`toCandidate` dưới đây. */
export const MIN_COMPLETION_TO_SCORE = 30;

/** Bảng nhân theo (số người × số tin) nên cặp không khớp gì thì không ghi. */
const MIN_MET_TO_STORE = 1;

/** Đổi công thức chấm là phải bump: vân tay cũ vẫn khớp thì mọi cặp giữ nguyên điểm tính bằng công thức cũ. */
const FORMULA_VERSION = 'v2';

export const profileSelect = {
  userId: true,
  headline: true,
  primarySkills: true,
  secondarySkills: true,
  citizenship: true,
  workPermit: true,
  location: true,
  willingToRelocate: true,
  experiences: true,
  updatedAt: true,
} satisfies Prisma.ProfileSelect;

type ProfileRow = Prisma.ProfileGetPayload<{ select: typeof profileSelect }>;

export const toCandidate = (row: ProfileRow): Candidate => ({
  userId: row.userId,
  profile: toMatchProfile(row),
  stamp: row.updatedAt.toISOString(),
});

export const pairKey = (userId: string, jobId: string) => `${userId}::${jobId}`;

/** `dictionarySize` là đầu vào thứ ba và dễ quên nhất: thiếu nó thì danh bạ dày lên mà mọi cặp đã tính vẫn giữ kết quả cũ. */
export function fingerprint(
  requirement: JobRequirement,
  stamp: string,
  dictionarySize: number,
): string {
  return `${FORMULA_VERSION}:${requirement.sourceHash ?? requirement.jobId}:${stamp}:d${dictionarySize}`;
}

export type MatchWrites = {
  fresh: Prisma.JobRequirementMatchCreateManyInput[];
  stale: { userId: string; jobId: string }[];
};

/** Nhân (tin × hồ sơ) rồi chia làm hai: cặp cần ghi và cặp cần bỏ. KHÔNG chạm database. */
export function planMatchWrites(
  requirements: JobRequirement[],
  candidates: Candidate[],
  dictionary: SkillDictionary,
  known: Map<string, string>,
): MatchWrites {
  const fresh: Prisma.JobRequirementMatchCreateManyInput[] = [];
  const stale: { userId: string; jobId: string }[] = [];

  for (const requirement of requirements) {
    const parsed = toRequirements(requirement);

    for (const candidate of candidates) {
      const hash = fingerprint(requirement, candidate.stamp, dictionary.size);
      const key = pairKey(candidate.userId, requirement.jobId);
      if (known.get(key) === hash) continue;

      const result = matchRequirements(parsed, candidate.profile, dictionary);
      if (result.met < MIN_MET_TO_STORE) {
        if (known.has(key)) {
          stale.push({ userId: candidate.userId, jobId: requirement.jobId });
        }
        continue;
      }

      fresh.push({
        userId: candidate.userId,
        jobId: requirement.jobId,
        met: result.met,
        total: result.total,
        percent: result.score,
        rank: result.rank,
        eligibility: result.eligibility,
        locationPass:
          result.checks.find((check) => check.kind === 'LOCATION')?.met ?? null,
        hash,
      });
    }
  }

  return { fresh, stale };
}
