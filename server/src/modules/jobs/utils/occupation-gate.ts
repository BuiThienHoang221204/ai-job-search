import type { JobSeniority, Prisma } from '@/generated/prisma/client';
import { yearsOfExperience } from '@/modules/profile/utils/experience-years';
import type { ProfileFit } from '../jobs.types';
import type { ListJobsQueryDto } from '../job.dto';
import { OTHER_CODE } from '../taxonomy/occupations';
import { REMOTE_CODE } from '../taxonomy/provinces';
import { nearbySeniorities, seniorityFromYears } from '../taxonomy/seniority';

/** Ngành và cấp bậc dùng để lọc: cấp bậc người dùng tự chọn, chưa chọn thì suy từ số năm kinh nghiệm trong hồ sơ. */
export function profileFit(
  profile: {
    occupationCode: string | null;
    subOccupationCodes: string[];
    preferredProvinces: string[];
    experienceLevel: JobSeniority;
    experiences: unknown;
  } | null,
): ProfileFit | null {
  if (!profile) return null;
  return {
    occupationCode: profile.occupationCode,
    subOccupationCodes: profile.subOccupationCodes,
    preferredProvinces: profile.preferredProvinces,
    experienceLevel:
      profile.experienceLevel !== 'UNKNOWN'
        ? profile.experienceLevel
        : seniorityFromYears(yearsOfExperience(profile.experiences)),
  };
}

export const needsOccupation = (fit: ProfileFit | null): boolean =>
  !fit?.occupationCode || fit.occupationCode === OTHER_CODE;

/** Cổng của "Việc làm phù hợp": đúng nhóm ngành của hồ sơ, đúng các nghề đã chọn (tin chưa rõ nghề vẫn qua), đúng các tỉnh đã chọn (tin làm từ xa hoặc chưa rõ địa điểm vẫn qua), cấp bậc lệch tối đa một bậc (tin chưa rõ cấp bậc vẫn qua); hồ sơ chưa chọn ngành thì không khớp tin nào. */
export function occupationGate(
  query: ListJobsQueryDto,
  fit: ProfileFit | null,
): Prisma.JobWhereInput | null {
  if (!query.scored) return null;
  if (!fit || needsOccupation(fit)) return { id: { in: [] } };

  const clauses: Prisma.JobWhereInput[] = [
    { occupationCode: fit.occupationCode },
  ];
  if (fit.subOccupationCodes.length) {
    clauses.push({
      OR: [
        { subOccupationCode: { in: fit.subOccupationCodes } },
        { subOccupationCode: null },
      ],
    });
  }
  if (fit.preferredProvinces.length) {
    clauses.push({
      OR: [
        { provinceCode: { in: [...fit.preferredProvinces, REMOTE_CODE] } },
        { provinceCode: null },
      ],
    });
  }
  const levels = nearbySeniorities(fit.experienceLevel);
  if (levels) {
    clauses.push({
      OR: [
        { requirements: { is: null } },
        {
          requirements: { is: { seniority: { in: [...levels, 'UNKNOWN'] } } },
        },
      ],
    });
  }

  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}
