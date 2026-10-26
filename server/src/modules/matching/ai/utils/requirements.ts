import type { Job, JobRequirement } from '@/generated/prisma/client';
import { fingerprint } from '@/common/fingerprint';
import {
  yearsByOccupation,
  yearsOfExperience,
} from '@/modules/profile/utils/experience-years';
import { OTHER_CODE } from '@/modules/jobs/taxonomy/occupations';
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

const isGroupList = (value: unknown): value is string[][] =>
  Array.isArray(value) &&
  value.every(
    (group) =>
      Array.isArray(group) &&
      group.every((option) => typeof option === 'string'),
  );

function groupsOf(
  row: JobRequirement,
): Pick<JobRequirements, 'requiredSkills' | 'niceToHaveSkills'> {
  const stored = row.skillGroups;
  if (
    stored &&
    typeof stored === 'object' &&
    !Array.isArray(stored) &&
    isGroupList(stored.required) &&
    isGroupList(stored.preferred)
  ) {
    return {
      requiredSkills: stored.required,
      niceToHaveSkills: stored.preferred,
    };
  }
  return {
    requiredSkills: row.requiredSkills.map((skill) => [skill]),
    niceToHaveSkills: row.niceToHaveSkills.map((skill) => [skill]),
  };
}

export function toRequirements(row: JobRequirement): JobRequirements {
  return {
    ...groupsOf(row),
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
  headline: string | null;
  primarySkills: string[];
  secondarySkills: string[];
  citizenship: string | null;
  workPermit: string | null;
  location: string | null;
  willingToRelocate: boolean;
  occupationCode: string | null;
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
    yearsByOccupation: yearsByOccupation(
      profile.experiences,
      profile.occupationCode,
    ),
  };
}

/** Hồ sơ nhìn từ một tin: `years` chỉ còn số năm ở cùng ngành với tin; tin chưa rõ ngành, hoặc không mục kinh nghiệm nào xếp được ngành, thì giữ tổng số năm. */
export function profileForJob(
  profile: MatchProfile,
  occupationCode: string | null,
): MatchProfile {
  const byOccupation = profile.yearsByOccupation;
  if (!occupationCode || occupationCode === OTHER_CODE || !byOccupation) {
    return profile;
  }
  if (byOccupation.size === 1 && byOccupation.has(OTHER_CODE)) return profile;
  return {
    ...profile,
    years: byOccupation.get(occupationCode) ?? 0,
  };
}

export const NO_SKILLS_ERROR =
  'Không rút được kỹ năng nào từ tin này, nên không có căn cứ để đối chiếu hồ sơ.';

export const hasSkills = (extracted: {
  requiredSkills: string[][];
  niceToHaveSkills: string[][];
}): boolean =>
  extracted.requiredSkills.length + extracted.niceToHaveSkills.length > 0;
