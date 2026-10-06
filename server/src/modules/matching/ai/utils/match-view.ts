import type { Job, Profile } from '@/generated/prisma/client';
import { fingerprint } from '@/common/fingerprint';
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
