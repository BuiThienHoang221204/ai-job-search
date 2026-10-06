import type { Job, JobRequirement } from '@/generated/prisma/client';
import { fingerprint } from '@/common/fingerprint';
import { yearsOfExperience } from '@/modules/profile/utils/experience-years';
import type { MatchProfile } from '@/modules/matching/rules/types';
import type { JobRequirements } from '../schemas/job-requirements.schema';

export function isUpToDate(
  record: { status: string; sourceHash: string | null } | null | undefined,
  hash: string,
): record is NonNullable<typeof record> {
  return record?.status === 'DONE' && record.sourceHash === hash;
}

export function sourceHash(job: Job): string {
  return fingerprint([
    job.title,
    job.description,
    job.location ?? '',
    job.workMode ?? '',
  ]);
}

export function toRequirements(row: JobRequirement): JobRequirements {
  return {
    requiredSkills: row.requiredSkills,
    niceToHaveSkills: row.niceToHaveSkills,
    minYears: row.minYears,
    seniority: row.seniority,
    citizenshipRequired: row.citizenshipRequired,
    workPermitRequired: row.workPermitRequired,
    eligibilityQuote: row.eligibilityQuote ?? '',
    city: row.city,
    remotePolicy: row.remotePolicy,
  };
}

/** Hồ sơ cho phép đối chiếu; `headline` được gộp vào danh sách kỹ năng. */
export function toMatchProfile(profile: {
  headline?: string | null;
  primarySkills: string[];
  secondarySkills: string[];
  citizenship: string | null;
  workPermit: string | null;
  location: string | null;
  willingToRelocate: boolean;
  experiences?: unknown;
}): MatchProfile {
  return {
    skills: [
      ...(profile.headline ? [profile.headline] : []),
      ...profile.primarySkills,
      ...profile.secondarySkills,
    ],
    citizenship: profile.citizenship,
    workPermit: profile.workPermit,
    location: profile.location,
    willingToRelocate: profile.willingToRelocate,
    years: yearsOfExperience(profile.experiences),
  };
}

export const NO_SKILLS_ERROR =
  'Không rút được kỹ năng nào từ tin này, nên không có căn cứ để đối chiếu hồ sơ.';

export const hasSkills = (extracted: {
  requiredSkills: string[];
  niceToHaveSkills: string[];
}): boolean =>
  extracted.requiredSkills.length + extracted.niceToHaveSkills.length > 0;
