export const APPLICABLE_FIELDS = [
  'headline',
  'location',
  'country',
  'summary',
  'languages',
  'primarySkills',
  'secondarySkills',
  'directExperienceDomains',
  'adjacentExperience',
  'experiences',
  'educations',
  'certificates',
  'projects',
] as const;

export function safeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'cv.pdf';
  const cleaned = base
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'cv.pdf';
}
