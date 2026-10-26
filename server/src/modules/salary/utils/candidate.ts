import { OTHER_CODE } from '@/modules/jobs/taxonomy/occupations';
import type { SalaryGuideProfile } from '../salary.types';

const known = (code: string | null): code is string =>
  code !== null && code !== OTHER_CODE;

export function salaryProfileOf(input: {
  sameOccupationYears: number | null;
  totalYears: number | null;
  profileOccupation: string | null;
  jobOccupation: string | null;
  currentSalary: number | null;
  expectedSalary: number | null;
}): SalaryGuideProfile {
  const otherOccupationYears =
    input.sameOccupationYears === 0 && (input.totalYears ?? 0) > 0
      ? input.totalYears
      : null;
  const otherOccupation =
    known(input.profileOccupation) &&
    known(input.jobOccupation) &&
    input.profileOccupation !== input.jobOccupation;

  return {
    candidateYears:
      otherOccupationYears === null ? input.sameOccupationYears : null,
    otherOccupationYears,
    currentSalary: otherOccupation ? null : input.currentSalary,
    currentSalaryIgnored: otherOccupation && (input.currentSalary ?? 0) > 0,
    expectedSalary: input.expectedSalary,
  };
}
