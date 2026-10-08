import type { JobSeniority } from '@/generated/prisma/client';

const SENIORITY_LADDER: JobSeniority[] = [
  'INTERN',
  'FRESHER',
  'JUNIOR',
  'MIDDLE',
  'SENIOR',
  'LEAD',
];

/** Cấp bậc lệch tối đa một bậc so với `level` (vd. JUNIOR → FRESHER, JUNIOR, MIDDLE); chưa rõ kinh nghiệm thì `null` = không lọc. */
export function nearbySeniorities(
  level: JobSeniority | null | undefined,
): JobSeniority[] | null {
  const at = level ? SENIORITY_LADDER.indexOf(level) : -1;
  if (at < 0) return null;
  return SENIORITY_LADDER.slice(Math.max(0, at - 1), at + 2);
}

/** Cấp bậc suy từ số năm kinh nghiệm, cùng mốc với bước chọn nhanh (Fresher < 1, Junior < 3, Mid < 5, Senior < 8, còn lại Lead); không biết số năm thì `null`. */
export function seniorityFromYears(years: number | null): JobSeniority | null {
  if (years === null) return null;
  if (years < 1) return 'FRESHER';
  if (years < 3) return 'JUNIOR';
  if (years < 5) return 'MIDDLE';
  if (years < 8) return 'SENIOR';
  return 'LEAD';
}
