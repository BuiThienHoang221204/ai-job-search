import { OTHER_CODE } from '../../jobs/taxonomy/occupations.js';
import { resolveOccupation } from '../../jobs/taxonomy/resolve.js';

/** Dấu người dùng hay dùng để ngăn chức danh với phần tự giới thiệu thêm. */
const SEPARATORS = /[|·•–—]/;

/** Đuôi kiểu "5 năm kinh nghiệm" — là lời tự giới thiệu, không phải chức danh. */
const EXPERIENCE_TAIL = /\s*\d+\+?\s*n[ăa]m\b[\s\S]*$/iu;

/** Phần CHỨC DANH của headline; giữ cả câu thì portal tìm không ra tin, còn "Mechanical Engineer" bị xếp vào IT. */
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

/** Mã nghề suy từ chức danh/kỹ năng; giữ `fallback` khi chưa đủ chữ để suy hoặc suy ra `OTHER_CODE` - "đoán không ra" không đáng tin hơn lựa chọn tường minh của user. */
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
