import type { CvSection, CvSegments } from './cv-score';

const BULLET = /^[•●◦▪▫‣·\-–—*➢►✓]\s*/;

const MIN_BULLET_CHARS = 10;

const MAX_HEADING_CHARS = 40;

const SECTION_HEADINGS: Array<[CvSection, RegExp]> = [
  ['experience', /kinh nghiệm|experience|employment|work history/i],
  ['education', /học vấn|trình độ|education|academic/i],
  ['skills', /kỹ năng|kĩ năng|skills|competenc/i],
  ['projects', /dự án|projects?/i],
  ['summary', /giới thiệu|mục tiêu|summary|profile|objective/i],
  ['certifications', /chứng chỉ|certificat/i],
];

export const normalizeText = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();

export function segmentByLayout(text: string): CvSegments {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const bullets = lines
    .filter((line) => BULLET.test(line))
    .map((line) => line.replace(BULLET, ''))
    .filter((line) => line.length >= MIN_BULLET_CHARS);

  const headings = lines.filter((line) => line.length <= MAX_HEADING_CHARS);
  const sections = SECTION_HEADINGS.filter(([, pattern]) =>
    headings.some((line) => pattern.test(line)),
  ).map(([section]) => section);

  return { sections, bullets };
}

export function keepVerbatim(bullets: string[], text: string): string[] {
  const haystack = normalizeText(text);
  return bullets.filter(
    (bullet) =>
      bullet.trim().length >= MIN_BULLET_CHARS &&
      haystack.includes(normalizeText(bullet)),
  );
}
