const WORDISH = String.raw`[\p{L}\p{N}]`;
const COMBINING_MARKS = /[̀-ͯ]/g;

const patterns = new Map<string, RegExp>();

/**
 * Hạ chữ thường, bỏ dấu tiếng Việt, GIỮ ký hiệu.
 *
 * `normalizeText` của taxonomy không dùng được: nó gộp ký hiệu về dấu cách nên
 * `C++`, `.NET`, `C#` cùng mất phần định danh.
 */
export function foldTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .trim();
}

/**
 * Biên từ chỉ áp ở phía mà từ khoá kết thúc bằng chữ hoặc số, nhờ vậy `.NET`
 * vẫn khớp "ASP.NET" còn `Excel` không khớp "excellence".
 */
function patternFor(needle: string): RegExp {
  const cached = patterns.get(needle);
  if (cached) return cached;

  const edge = new RegExp(WORDISH, 'u');
  const left = edge.test(needle[0]) ? `(?<!${WORDISH})` : '';
  const right = edge.test(needle[needle.length - 1]) ? `(?!${WORDISH})` : '';
  const body = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${left}${body}${right}`, 'iu');

  if (patterns.size > 2000) patterns.clear();
  patterns.set(needle, pattern);
  return pattern;
}

/**
 * `text` có chứa `term` như một TỪ hay không, bỏ qua dấu và hoa thường.
 *
 * Phép so khớp kỹ năng duy nhất của hệ thống. Bản cũ khớp chuỗi con nên hồ sơ
 * khai mỗi "IT" ăn 100% với tin "Digital Marketing".
 */
export function containsTerm(text: string, term: string): boolean {
  const needle = foldTerm(term);
  if (needle.length < 2) return false;
  return patternFor(needle).test(foldTerm(text));
}
