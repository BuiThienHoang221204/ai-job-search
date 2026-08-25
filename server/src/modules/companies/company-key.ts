import { ANONYMOUS_COMPANIES } from '../jobs/taxonomy/dedupe.js';
import { normalizeText } from '../jobs/taxonomy/resolve.js';

/**
 * Từ chỉ loại hình pháp nhân. Bỏ đi để "Công ty TNHH FPT Software" và "FPT
 * Software" dùng chung một bản tìm hiểu. Cố ý KHÔNG có `co` đứng một mình:
 * "Công ty Cơ khí Hà Nội" sẽ bị cắt thành "khi ha noi" - dùng cụm `co ltd`.
 */
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

/**
 * Cố ý KHÔNG bỏ tên quốc gia: "Samsung Vietnam" và "Samsung" là hai nơi làm
 * việc khác nhau. Gộp nhầm thì hiện sai đánh giá; không gộp chỉ tốn một lượt
 * gọi model.
 */
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
