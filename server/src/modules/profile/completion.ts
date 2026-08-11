import type { Profile } from '../../generated/prisma/client.js';

/// Các trường quyết định chất lượng chấm điểm, kèm nhãn tiếng Việt để hiện ra
/// cho người dùng biết còn thiếu gì.
///
/// Đây không phải mọi trường trong bảng Profile - chỉ những trường thật sự đi
/// vào prompt đánh giá. Thêm một trường trang trí vào đây sẽ làm phần trăm
/// hoàn thiện tụt xuống mà không cải thiện kết quả nào.
///
/// Thứ tự trong mảng là thứ tự ưu tiên hiển thị: cái đầu tiên ảnh hưởng nhiều
/// nhất đến độ chính xác của việc chấm điểm.
export const SCORED_FIELDS = [
  { key: 'primarySkills', label: 'Kỹ năng chính' },
  { key: 'experiences', label: 'Kinh nghiệm làm việc' },
  { key: 'headline', label: 'Chức danh' },
  { key: 'location', label: 'Địa điểm' },
  { key: 'citizenship', label: 'Quốc tịch' },
  { key: 'careerGoals', label: 'Mục tiêu nghề nghiệp' },
  { key: 'summary', label: 'Giới thiệu bản thân' },
  { key: 'educations', label: 'Học vấn' },
  { key: 'secondarySkills', label: 'Kỹ năng phụ' },
  { key: 'directExperienceDomains', label: 'Lĩnh vực đã làm' },
  { key: 'country', label: 'Quốc gia' },
  { key: 'energizingTasks', label: 'Công việc tạo hứng thú' },
  { key: 'targetSectors', label: 'Ngành mục tiêu' },
] as const satisfies ReadonlyArray<{ key: keyof Profile; label: string }>;

/// Một trường được coi là đã điền khi nó có nội dung thật: mảng rỗng và chuỗi
/// toàn khoảng trắng đều tính là chưa điền.
const isFilled = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

export function missingFields(profile: Profile | null): string[] {
  if (!profile) return SCORED_FIELDS.map((field) => field.label);
  return SCORED_FIELDS.filter((field) => !isFilled(profile[field.key])).map(
    (field) => field.label,
  );
}

export function completionPercent(profile: Profile | null): number {
  if (!profile) return 0;
  const missing = missingFields(profile).length;
  return Math.round(
    ((SCORED_FIELDS.length - missing) / SCORED_FIELDS.length) * 100,
  );
}
