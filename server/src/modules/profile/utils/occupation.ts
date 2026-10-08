import { OTHER_CODE } from '@/modules/jobs/taxonomy/occupations';
import { resolveOccupation } from '@/modules/jobs/taxonomy/resolve';

const SEPARATORS = /[|·•–—]/;

const EXPERIENCE_TAIL = /\s*\d+\+?\s*n[ăa]m\b[\s\S]*$/iu;

/** Phần chức danh của headline; giữ cả câu thì portal tìm không ra tin. */
export function jobTitleOf(raw: string): string {
  return raw
    .normalize('NFC')
    .split(SEPARATORS)[0]
    .replace(/\(.*?\)/g, '')
    .replace(EXPERIENCE_TAIL, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type OccupationSource = {
  headline: string | null;
  primarySkills: string[];
};

/** Ngành sau một lần lưu: người dùng tự chọn thì giữ; chỉ suy lại khi chức danh hoặc kỹ năng chính vừa đổi. */
export function occupationAfterSave(
  saved: OccupationSource & { occupationCode: string | null },
  data: Record<string, unknown>,
): string | null {
  const has = (key: string) => data[key] !== undefined;
  if (has('occupationCode')) return saved.occupationCode;
  if (!has('headline') && !has('primarySkills')) return saved.occupationCode;
  return profileOccupation(saved, saved.occupationCode);
}

export function profileOccupation(
  profile: OccupationSource,
  fallback: string | null = null,
): string | null {
  const headline = jobTitleOf(profile.headline ?? '');
  const skills = profile.primarySkills.filter((skill) => skill.trim());

  if (!headline && !skills.length) return fallback;

  const resolved = resolveOccupation(headline, skills);
  return resolved === OTHER_CODE ? (fallback ?? resolved) : resolved;
}
