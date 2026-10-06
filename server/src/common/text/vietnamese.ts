const WORDISH = String.raw`[\p{L}\p{N}]`;
const COMBINING_MARKS = /[̀-ͯ]/g;

const patterns = new Map<string, RegExp>();

export function foldTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .trim();
}

export function normalizeText(value: string): string {
  return foldTerm(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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

export function containsTerm(text: string, term: string): boolean {
  const needle = foldTerm(term);
  if (needle.length < 2) return false;
  return patternFor(needle).test(foldTerm(text));
}

/** Đếm số `terms` khớp theo TỪ trong `text`, không đếm trùng cách viết. */
export function countTerms(text: string, terms: string[]): number {
  const matched = new Set<string>();
  for (const term of terms) {
    const needle = foldTerm(term);
    if (needle.length < 2 || matched.has(needle)) continue;
    if (containsTerm(text, term)) matched.add(needle);
  }
  return matched.size;
}
