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
