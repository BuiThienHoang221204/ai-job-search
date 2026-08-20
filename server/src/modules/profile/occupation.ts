import { resolveOccupation } from '../jobs/taxonomy/resolve.js';
import { jobTitleOf } from './headline.js';

/** Đúng những trường của hồ sơ mà việc suy ngành cần tới. */
export type OccupationSource = {
  headline: string | null;
  primarySkills: string[];
};

/**
 * Ngành của một hồ sơ, dùng chung danh mục với tin tuyển dụng.
 *
 * Trả `null` khi hồ sơ chưa có gì để suy - KHÁC với tin tuyển dụng, nơi không
 * suy ra được thì rơi vào `OTHER`. Hồ sơ trống mà gán `OTHER` sẽ gộp mọi người
 * chưa điền hồ sơ thành một cụm, rồi cụm rỗng đó chiếm một suất truy vấn.
 */
export function profileOccupation(profile: OccupationSource): string | null {
  // Phân loại trên phần CHỨC DANH, không phải cả headline: "Kỹ sư cơ khí |
  // Mechanical Engineer" mà để nguyên thì chữ "engineer" ở đoạn sau kéo hồ sơ
  // vào nhóm công nghệ thông tin, vì nhóm đó đứng trước trong danh mục.
  const headline = jobTitleOf(profile.headline ?? '');
  const skills = profile.primarySkills.filter((skill) => skill.trim());

  if (!headline && !skills.length) return null;
  return resolveOccupation(headline, skills);
}
