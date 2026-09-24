import { createHash } from 'node:crypto';
import type {
  Job,
  JobRequirement,
} from '../../../../generated/prisma/client.js';
import { yearsOfExperience } from '../../../profile/utils/experience-years.js';
import type { MatchProfile } from '../../rules/types.js';
import type { JobRequirements } from '../schemas/job-requirements.schema.js';

/** Băm ĐÚNG những trường `jobPrompt` đưa cho model — thêm trường vào prompt mà quên đây thì tin cũ không bao giờ rút lại. */
export function sourceHash(job: Job): string {
  return createHash('sha256')
    .update(job.title)
    .update(job.description)
    .update(job.location ?? '')
    .update(job.workMode ?? '')
    .digest('hex')
    .slice(0, 32);
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
