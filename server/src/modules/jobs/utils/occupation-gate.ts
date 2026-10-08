import type { JobSeniority, Prisma } from '@/generated/prisma/client';
import { yearsOfExperience } from '@/modules/profile/utils/experience-years';
import type { ProfileFit } from '../jobs.types';
import type { ListJobsQueryDto } from '../job.dto';
import { OTHER_CODE } from '../taxonomy/occupations';
import { nearbySeniorities, seniorityFromYears } from '../taxonomy/seniority';

/** Ngành và cấp bậc dùng để lọc: cấp bậc người dùng tự chọn, chưa chọn thì suy từ số năm kinh nghiệm trong hồ sơ. */
export function profileFit(
  profile: {
    occupationCode: string | null;
    experienceLevel: JobSeniority;
    experiences: unknown;
  } | null,
): ProfileFit | null {
  if (!profile) return null;
  return {
    occupationCode: profile.occupationCode,
    experienceLevel:
      profile.experienceLevel !== 'UNKNOWN'
        ? profile.experienceLevel
        : seniorityFromYears(yearsOfExperience(profile.experiences)),
  };
}

export const needsOccupation = (fit: ProfileFit | null): boolean =>
  !fit?.occupationCode || fit.occupationCode === OTHER_CODE;

/** Cổng của "Việc làm phù hợp": đúng nhóm ngành của hồ sơ, cấp bậc lệch tối đa một bậc (tin chưa rõ cấp bậc vẫn qua); hồ sơ chưa chọn ngành thì không khớp tin nào. */
export function occupationGate(
  query: ListJobsQueryDto,
  fit: ProfileFit | null,
): Prisma.JobWhereInput | null {
  if (!query.scored) return null;
  if (!fit || needsOccupation(fit)) return { id: { in: [] } };

  const levels = nearbySeniorities(fit.experienceLevel);
  if (!levels) return { occupationCode: fit.occupationCode };

  return {
    occupationCode: fit.occupationCode,
    OR: [
      { requirements: { is: null } },
      { requirements: { is: { seniority: { in: [...levels, 'UNKNOWN'] } } } },
    ],
  };
}
