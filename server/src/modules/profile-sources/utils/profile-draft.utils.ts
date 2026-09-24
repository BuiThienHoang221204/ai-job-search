import type { ProfileProposal } from '../profile-proposal.schema.js';

/** Danh sách TRẮNG: `fields` đến từ HTTP nên danh sách đen sẽ cho lọt trường mới. */
const APPLICABLE_FIELDS = [
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

type ApplicableField = (typeof APPLICABLE_FIELDS)[number];

const isApplicableField = (value: string): value is ApplicableField =>
  (APPLICABLE_FIELDS as readonly string[]).includes(value);

/** Lọc ra đúng những trường vừa được chọn vừa có giá trị trong đề xuất. */
export function pickProposalFields(
  proposal: ProfileProposal,
  fields: string[],
): Record<string, unknown> {
  const chosen = new Set(fields.filter(isApplicableField));
  const data: Record<string, unknown> = {};

  for (const field of APPLICABLE_FIELDS) {
    if (!chosen.has(field)) continue;
    const value = proposal[field];
    if (value === undefined || value === null) continue;
    data[field] = value;
  }

  return data;
}

/** Làm sạch tên file trước khi ghép vào đường dẫn lưu trữ. */
export function safeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'cv.pdf';
  const cleaned = base
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'cv.pdf';
}
