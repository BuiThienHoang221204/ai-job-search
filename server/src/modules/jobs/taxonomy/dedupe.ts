import { PROVINCES } from './provinces';
import { normalizeText } from '@/common/text/vietnamese';

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

export const ANONYMOUS_COMPANIES = [
  'khong ro',
  'cong ty bao mat',
  'confidential',
  'unknown',
  'n a',
];

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

/** Vân tay công ty + chức danh + tỉnh; `null` khi thiếu dữ liệu — tin đó coi như duy nhất. */
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
