import { createHash } from 'node:crypto';
import type { Job, Profile } from '../../../../generated/prisma/client.js';
import { isStaleMatch } from '../../rules/staleness.js';

/** Băm ĐÚNG thứ model nhìn thấy — băm object hồ sơ thì `updatedAt` phá cache còn `tags` đổi lại không nhận ra. */
export function promptHash(system: string, prompt: string): string {
  return createHash('sha256')
    .update(system)
    .update(prompt)
    .digest('hex')
    .slice(0, 32);
}

/** Thêm cờ `saved` vào bản ghi job LỒNG bên trong match, không phải vào chính match. */
export function withSavedFlag<T extends { job: { saves: unknown[] } }>(
  match: T,
) {
  const { saves, ...job } = match.job;
  return { ...match, job: { ...job, saved: saves.length > 0 } };
}

/** Thêm cờ `stale`: chấm TRƯỚC lần sửa hồ sơ gần nhất là cũ, chưa chấm bao giờ thì không cũ. */
export function withStaleFlag<T extends { evaluatedAt: Date | null }>(
  match: T,
  profileUpdatedAt: Date | null,
) {
  return { ...match, stale: isStaleMatch(match.evaluatedAt, profileUpdatedAt) };
}

/** DANH SÁCH không mang văn xuôi dài: đo 2026-08-22, bảy trường `*Note` chiếm 21.608 byte cho 20 dòng mà không màn nào vẽ. */
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
