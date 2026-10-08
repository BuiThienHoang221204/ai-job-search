import type { Job, Prisma, Profile } from '@/generated/prisma/client';
import { fingerprint } from '@/common/fingerprint';
import type { MatchSort } from '@/modules/matching/matching.dto';
import { isStaleMatch } from '@/modules/matching/rules/staleness';

export function promptHash(system: string, prompt: string): string {
  return fingerprint([system, prompt]);
}

export function withSavedFlag<T extends { job: { saves: unknown[] } }>(
  match: T,
) {
  const { saves, ...job } = match.job;
  return { ...match, job: { ...job, saved: saves.length > 0 } };
}

export function withStaleFlag<T extends { evaluatedAt: Date | null }>(
  match: T,
  profileUpdatedAt: Date | null,
) {
  return { ...match, stale: isStaleMatch(match.evaluatedAt, profileUpdatedAt) };
}

/** Thứ tự danh sách "Đã chấm bằng AI": mặc định lượt chấm mới nhất trước; theo điểm thì hoà điểm xếp lượt chấm mới hơn lên trước. */
export function matchListOrder(
  sort: MatchSort = 'newest',
): Prisma.JobMatchOrderByWithRelationInput[] {
  const newest: Prisma.JobMatchOrderByWithRelationInput[] = [
    { evaluatedAt: { sort: 'desc', nulls: 'last' } },
    { updatedAt: 'desc' },
    { id: 'desc' },
  ];
  if (sort === 'newest') return newest;
  const direction = sort === 'score_asc' ? 'asc' : 'desc';
  return [{ overallScore: { sort: direction, nulls: 'last' } }, ...newest];
}

export const LIST_FIELDS = {
  id: true,
  userId: true,
  jobId: true,
  status: true,
  eligibility: true,
  overallScore: true,
  verdict: true,
  technicalScore: true,
  experienceScore: true,
  behavioralScore: true,
  careerScore: true,
  locationPass: true,
  strengths: true,
  gaps: true,
  evaluatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type EvaluationInputs = {
  profile: Profile | null;
  job: Job;
  system: string;
  prompt: string;
  hash: string;
};
