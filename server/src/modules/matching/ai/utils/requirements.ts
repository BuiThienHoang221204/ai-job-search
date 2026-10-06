import type { Job, JobRequirement } from '@/generated/prisma/client';
import { fingerprint } from '@/common/fingerprint';
import { yearsOfExperience } from '@/modules/profile/utils/experience-years';
import type { MatchProfile } from '@/modules/matching/rules/types';
import type { JobRequirements } from '../schemas/job-requirements.schema';

/** Băm ĐÚNG những trường `jobPrompt` đưa cho model — thêm trường vào prompt mà quên đây thì tin cũ không bao giờ rút lại. */
export function sourceHash(job: Job): string {
  return fingerprint([
    job.title,
    job.description,
    job.location ?? '',
    job.workMode ?? '',
  ]);
}

/** Đổi bản ghi database thành hình dạng mà `matchRequirements` nhận. */
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

/** `headline` đi vào CÙNG danh sách kỹ năng: tin đòi "kế toán" mà hồ sơ chỉ khai Excel/Misa sẽ khớp 0 dù chức danh ghi rõ. */
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

/** Bản rút không có kỹ năng nào là bản hỏng: ghi DONE thì luật chấm chỉ còn số năm để đối chiếu. */
export const hasSkills = (extracted: {
  requiredSkills: string[];
  niceToHaveSkills: string[];
}): boolean =>
  extracted.requiredSkills.length + extracted.niceToHaveSkills.length > 0;
