import type { RequirementMatch } from '@/modules/matching/rules/types';

export type GapView = {
  readiness: number;
  skillMet: number;
  skillTotal: number;
  have: string[];
  missingRequired: string[];
  missingNice: string[];
  years: { label: string; enough: boolean; note: string | null } | null;
};

/** RequirementMatch (đối chiếu bằng CODE) → khung "kỹ năng còn thiếu" cho tiện ích: nhóm kỹ
 * năng đã đạt / thiếu bắt buộc / nên có thêm, kèm mốc kinh nghiệm. Không chạm model. */
export function gapView(result: RequirementMatch): GapView {
  const have: string[] = [];
  const missingRequired: string[] = [];
  const missingNice: string[] = [];

  for (const check of result.checks) {
    if (check.kind === 'SKILL') {
      (check.met ? have : missingRequired).push(check.label);
    } else if (check.kind === 'NICE' && !check.met) {
      missingNice.push(check.label);
    }
  }

  const years = result.checks.find((check) => check.kind === 'YEARS');
  return {
    readiness: result.score,
    skillMet: result.skillMet,
    skillTotal: result.skillTotal,
    have,
    missingRequired,
    missingNice,
    years: years
      ? {
          label: years.label,
          enough: years.met === true,
          note: years.note ?? null,
        }
      : null,
  };
}
