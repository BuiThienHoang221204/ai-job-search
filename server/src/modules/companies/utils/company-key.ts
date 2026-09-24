import { ANONYMOUS_COMPANIES } from '../../jobs/taxonomy/dedupe.js';
import { normalizeText } from '../../jobs/taxonomy/resolve.js';

/** Loại hình pháp nhân, bỏ khi dựng khoá. KHÔNG có `co` đứng một mình: "Cơ khí Hà Nội" sẽ vỡ. */
const LEGAL_FORMS = [
  'cong ty co phan',
  'cong ty tnhh mot thanh vien',
  'cong ty tnhh',
  'cong ty',
  'tnhh mot thanh vien',
  'mot thanh vien',
  'van phong dai dien',
  'joint stock company',
  'corporation',
  'chi nhanh',
  'limited',
  'co phan',
  'tap doan',
  'company',
  'co ltd',
  'cty',
  'tnhh',
  'gmbh',
  'corp',
  'ltd',
  'llc',
  'jsc',
  'plc',
  'pte',
  'mtv',
  'inc',
  'cp',
].sort((a, b) => b.length - a.length);

/** KHÔNG bỏ tên quốc gia: "Samsung Vietnam" và "Samsung" là hai nơi khác nhau. */
export function companyKeyOf(company: string): string | null {
  const normalized = normalizeText(company);
  if (!normalized || ANONYMOUS_COMPANIES.includes(normalized)) return null;

  let text = ` ${normalized} `;
  for (const form of LEGAL_FORMS) {
    text = text.split(` ${form} `).join(' ');
  }

  const key = text.replace(/\s+/g, ' ').trim();
  return key === '' ? null : key;
}
