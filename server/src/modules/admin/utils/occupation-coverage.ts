import { OCCUPATIONS, OTHER_CODE } from '@/modules/jobs/taxonomy/occupations';
import { SUB_OCCUPATIONS } from '@/modules/jobs/taxonomy/sub-occupations';

export interface OccupationCoverageRow {
  code: string;
  name: string;
  jobCount: number;
  attempted: boolean;
  stale: boolean;
}

function crawlCodesOf(groupCode: string): string[] {
  return [
    groupCode,
    ...(SUB_OCCUPATIONS[groupCode] ?? []).map((sub) => sub.code),
  ];
}

export function occupationCoverage(
  jobCounts: Map<string, number>,
  crawledCodes: Set<string>,
): OccupationCoverageRow[] {
  return OCCUPATIONS.filter((occupation) => occupation.code !== OTHER_CODE).map(
    (occupation) => {
      const attempted = crawlCodesOf(occupation.code).some((code) =>
        crawledCodes.has(code),
      );
      const jobCount = jobCounts.get(occupation.code) ?? 0;

      return {
        code: occupation.code,
        name: occupation.name,
        jobCount,
        attempted,
        stale: attempted && jobCount === 0,
      };
    },
  );
}
