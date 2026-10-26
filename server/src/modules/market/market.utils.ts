import type { JobSeniority, Prisma } from '@/generated/prisma/client';
import { normalizeText } from '@/common/text/vietnamese';

export const MARKET_WINDOW_DAYS = 30;
export const MIN_MARKET_JOBS = 100;

const TOP_SKILLS = 10;
const TOP_SUB_OCCUPATIONS = 6;
const TOP_PROVINCES = 4;

const SENIORITY_GROUPS: { label: string; levels: JobSeniority[] }[] = [
  {
    label: 'Thực tập – Junior',
    levels: ['INTERN', 'FRESHER', 'JUNIOR'],
  },
  { label: 'Middle', levels: ['MIDDLE'] },
  { label: 'Senior / Lead', levels: ['SENIOR', 'LEAD'] },
];

export type MarketJob = {
  subOccupationCode: string | null;
  provinceCode: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  skillKeys: string[] | null;
  seniority: JobSeniority | null;
};

/** Tin đăng trong `[from, to)`; tin không có ngày đăng tính theo ngày quét, như cổng "Việc làm phù hợp". */
export const postedBetween = (from: Date, to: Date): Prisma.JobWhereInput => ({
  OR: [
    { postedAt: { gte: from, lt: to } },
    { postedAt: null, scrapedAt: { gte: from, lt: to } },
  ],
});

export const marketSlugOf = (name: string) =>
  normalizeText(name).replace(/ /g, '-');

/** Lương tháng VND đại diện của một tin: giữa khoảng, hoặc mức duy nhất portal ghi. */
export function salaryOf(job: Pick<MarketJob, 'salaryMin' | 'salaryMax'>) {
  if (job.salaryMin !== null && job.salaryMax !== null) {
    return (job.salaryMin + job.salaryMax) / 2;
  }
  return job.salaryMin ?? job.salaryMax;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

const capitalize = (text: string) =>
  text.charAt(0).toLocaleUpperCase('vi') + text.slice(1);

const percent = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 100) : 0;

function countBy(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** Gom tin của một ngành thành các mục của báo cáo; `names` đổi mã (kỹ năng, nghề, tỉnh) ra tên hiển thị. */
export function marketSections(jobs: MarketJob[], names: Map<string, string>) {
  const salaries = jobs
    .map(salaryOf)
    .filter((value): value is number => value !== null);
  const analysed = jobs.filter((job) => job.skillKeys !== null);
  const skillKeys = analysed.flatMap((job) => [...new Set(job.skillKeys)]);
  const subCodes = jobs
    .map((job) => job.subOccupationCode)
    .filter((code): code is string => code !== null);
  const provinceCodes = jobs
    .map((job) => job.provinceCode)
    .filter((code): code is string => code !== null);
  const levels = jobs
    .map((job) => job.seniority)
    .filter(
      (level): level is JobSeniority => level !== null && level !== 'UNKNOWN',
    );

  return {
    salary: {
      median: median(salaries),
      withSalaryPercent: percent(salaries.length, jobs.length),
    },
    skills: {
      analysed: analysed.length,
      top: countBy(skillKeys)
        .slice(0, TOP_SKILLS)
        .map(([key, count]) => ({
          name: capitalize(names.get(key) ?? key),
          percent: percent(count, analysed.length),
        })),
    },
    subOccupations: countBy(subCodes)
      .slice(0, TOP_SUB_OCCUPATIONS)
      .map(([code, count]) => ({
        name: names.get(code) ?? code,
        count,
        medianSalary: median(
          jobs
            .filter((job) => job.subOccupationCode === code)
            .map(salaryOf)
            .filter((value): value is number => value !== null),
        ),
      })),
    provinces: countBy(provinceCodes)
      .slice(0, TOP_PROVINCES)
      .map(([code, count]) => ({
        name: names.get(code) ?? code,
        percent: percent(count, jobs.length),
      })),
    seniority: SENIORITY_GROUPS.map((group) => ({
      label: group.label,
      percent: percent(
        levels.filter((level) => group.levels.includes(level)).length,
        levels.length,
      ),
    })),
  };
}
