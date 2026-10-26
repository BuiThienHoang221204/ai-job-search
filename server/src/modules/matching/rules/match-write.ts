import type { JobRequirement, Prisma } from '@/generated/prisma/client';
import {
  profileForJob,
  toMatchProfile,
  toRequirements,
} from '../ai/utils/requirements';
import { matchRequirements } from './requirement-match';
import type { Candidate, SkillDictionary } from './types';

export const MIN_COMPLETION_TO_SCORE = 30;

const MIN_SKILLS_TO_STORE = 1;

const FORMULA_VERSION = 'v5';

export const profileSelect = {
  userId: true,
  headline: true,
  primarySkills: true,
  secondarySkills: true,
  citizenship: true,
  workPermit: true,
  location: true,
  willingToRelocate: true,
  occupationCode: true,
  experiences: true,
  updatedAt: true,
} satisfies Prisma.ProfileSelect;

type ProfileRow = Prisma.ProfileGetPayload<{ select: typeof profileSelect }>;

export const toCandidate = (row: ProfileRow): Candidate => ({
  userId: row.userId,
  profile: toMatchProfile(row),
  stamp: row.updatedAt.toISOString(),
});

export type ScoredRequirement = JobRequirement & {
  job: { occupationCode: string | null };
};

export const pairKey = (userId: string, jobId: string) => `${userId}::${jobId}`;

export function fingerprint(
  requirement: JobRequirement,
  stamp: string,
  dictionary: SkillDictionary,
): string {
  return `${FORMULA_VERSION}:${requirement.sourceHash ?? requirement.jobId}:${stamp}:d${dictionary.aliases.size}i${dictionary.implies.size}`;
}

export type MatchWrites = {
  fresh: Prisma.JobRequirementMatchCreateManyInput[];
  stale: { userId: string; jobId: string }[];
};

export function planMatchWrites(
  requirements: ScoredRequirement[],
  candidates: Candidate[],
  dictionary: SkillDictionary,
  known: Map<string, string>,
): MatchWrites {
  const fresh: Prisma.JobRequirementMatchCreateManyInput[] = [];
  const stale: { userId: string; jobId: string }[] = [];

  for (const requirement of requirements) {
    const parsed = toRequirements(requirement);

    for (const candidate of candidates) {
      const hash = fingerprint(requirement, candidate.stamp, dictionary);
      const key = pairKey(candidate.userId, requirement.jobId);
      if (known.get(key) === hash) continue;

      const result = matchRequirements(
        parsed,
        profileForJob(candidate.profile, requirement.job.occupationCode),
        dictionary,
      );
      if (result.skillMet < MIN_SKILLS_TO_STORE) {
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
