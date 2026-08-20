/** Dấu người dùng hay dùng để ngăn chức danh với phần tự giới thiệu thêm. */
const SEPARATORS = /[|·•–—]/;

/** Đuôi kiểu "5 năm kinh nghiệm" - là lời tự giới thiệu, không phải chức danh. */
const EXPERIENCE_TAIL = /\s*\d+\+?\s*n[ăa]m\b[\s\S]*$/iu;

/**
 * Phần CHỨC DANH của một headline, bỏ đoạn tự giới thiệu phía sau.
 *
 * Headline thật có dạng "Kỹ sư cơ khí | Mechanical Engineer" hay "Kế toán tổng
 * hợp | 5 năm kinh nghiệm". Giữ nguyên cả câu gây hai lỗi khác nhau: portal tìm
 * bằng cả câu thì không ra tin nào, còn bộ phân loại ngành thì bắt nhầm từ khoá
 * ở đoạn sau - "engineer" trong "Mechanical Engineer" đẩy một kỹ sư cơ khí vào
 * nhóm công nghệ thông tin.
 */
export function jobTitleOf(raw: string): string {
  return raw
    .normalize('NFC')
    .split(SEPARATORS)[0]
    .replace(/\(.*?\)/g, '')
    .replace(EXPERIENCE_TAIL, '')
    .replace(/\s+/g, ' ')
    .trim();
}
