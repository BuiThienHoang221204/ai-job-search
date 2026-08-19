import { PROVINCES } from './provinces.js';
import { normalizeText } from './resolve.js';

/**
 * Khoá gộp tin trùng giữa các portal.
 *
 * Cùng một tin đăng trên TopCV, VietnamWorks và LinkedIn có ba `externalId`
 * khác nhau, nên `@@unique([source, externalId])` không nhận ra. Không gộp thì
 * mỗi bản sao tốn một lượt gọi model và chiếm một suất chấm điểm của người dùng.
 */

/**
 * Nhãn trang trí nhà tuyển dụng gắn thêm, không nói gì về công việc. Cố ý KHÔNG
 * có "moi", "new", "hot": chúng là từ thật trong "chuyen vien moi gioi".
 */
const NOISE_PHRASES = [
  'tuyen gap',
  'tuyen dung',
  'can tuyen',
  'di lam ngay',
  'luong hap dan',
  'thu nhap hap dan',
  'urgent',
  'hot job',
  'part time',
  'full time',
];

/** Tên công ty vô danh. Gộp mọi tin ẩn danh cùng tỉnh vào một là sai nặng. */
const ANONYMOUS_COMPANIES = [
  'khong ro',
  'cong ty bao mat',
  'confidential',
  'unknown',
  'n a',
];

/** Mọi cách viết tỉnh/thành, đã chuẩn hoá, dài trước ngắn sau. */
const PROVINCE_TOKENS = PROVINCES.flatMap((province) => [
  normalizeText(province.name),
  ...province.aliases,
]).sort((a, b) => b.length - a.length);

/** Bỏ phần trang trí của tiêu đề: mức lương, nhãn tuyển gấp, tên tỉnh lặp lại. */
export function stripNoise(normalized: string): string {
  let text = ` ${normalized} `;

  for (const phrase of NOISE_PHRASES) {
    text = text.split(` ${phrase} `).join(' ');
  }

  text = text.replace(/ (luong|thu nhap|up to|upto) .*$/, ' ');
  text = text.replace(/ \d+([ -]\d+)? (trieu|tr|usd|m|k)\b/g, ' ');

  for (const token of PROVINCE_TOKENS) {
    text = text.split(` ${token} `).join(' ');
  }

  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Khoá vân tay của một tin: công ty, chức danh đã bỏ nhiễu, và tỉnh. Trả `null`
 * khi không đủ dữ liệu để gộp - lúc đó tin được coi là duy nhất.
 */
export function dedupeKeyOf(
  title: string,
  company: string,
  provinceCode: string | null,
): string | null {
  const org = normalizeText(company);
  if (!org || ANONYMOUS_COMPANIES.includes(org)) return null;

  const role = stripNoise(normalizeText(title));
  if (!role) return null;

  return `${org}|${role}|${provinceCode ?? ''}`;
}
