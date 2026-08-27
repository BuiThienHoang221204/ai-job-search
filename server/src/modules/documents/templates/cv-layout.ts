/** Bố cục CV: mục nào đứng trước, mục nào ẩn. Tách khỏi nội dung. */

/** Khoá của sáu mục cố định. Thứ tự ở đây là thứ tự mặc định. */
export const SECTION_KEYS = [
  'profile',
  'competencies',
  'experience',
  'projects',
  'education',
  'skills',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export type CvLayout = {
  order: SectionKey[];
  hidden: SectionKey[];
};

export const DEFAULT_LAYOUT: CvLayout = {
  order: [...SECTION_KEYS],
  hidden: [],
};

const isSectionKey = (value: unknown): value is SectionKey =>
  typeof value === 'string' && SECTION_KEYS.includes(value as SectionKey);

/** Lọc lấy khoá hợp lệ, bỏ trùng, giữ nguyên thứ tự xuất hiện. */
const cleanKeys = (raw: unknown): SectionKey[] =>
  Array.isArray(raw) ? [...new Set(raw.filter(isSectionKey))] : [];

/**
 * Đọc bố cục đã lưu, chữa lại phần hỏng. Nhận `unknown` vì nguồn là cột Json.
 *
 * Khoá thiếu được NỐI VÀO CUỐI chứ không bỏ đi: thêm mục thứ sáu ở bản sau sẽ tự
 * xuất hiện trong CV cũ, thay vì biến mất không dấu vết.
 */
export const resolveLayout = (raw: unknown): CvLayout => {
  const stored = (raw ?? {}) as { order?: unknown; hidden?: unknown };
  const order = cleanKeys(stored.order);
  const missing = SECTION_KEYS.filter((key) => !order.includes(key));

  return { order: [...order, ...missing], hidden: cleanKeys(stored.hidden) };
};
