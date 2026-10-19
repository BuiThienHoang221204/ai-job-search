import { normalizeText } from '@/common/text/vietnamese';
import { dedupeKeyOf } from './dedupe';
import { OCCUPATIONS, OTHER_CODE } from './occupations';
import { PORTAL_CATEGORY_OCCUPATION } from './portal-categories';
import { PROVINCES, REMOTE_CODE } from './provinces';
import { parseSalary, type ParsedSalary } from './salary';
import { SUB_OCCUPATIONS } from './sub-occupations';

const padded = (value: string) => ` ${value} `;

const REMOTE_HINTS = ['remote', 'lam viec tu xa', 'tu xa', 'work from home'];

const ALIASES: ReadonlyArray<{ name: string; code: string }> =
  PROVINCES.flatMap((province) =>
    [normalizeText(province.name), ...province.aliases].map((name) => ({
      name,
      code: province.code,
    })),
  ).sort((left, right) => right.name.length - left.name.length);

export function resolveProvince(location: string | null): string | null {
  if (!location) return null;
  const haystack = padded(normalizeText(location));
  if (!haystack.trim()) return null;

  for (const alias of ALIASES) {
    if (haystack.includes(padded(alias.name))) return alias.code;
  }

  if (REMOTE_HINTS.some((hint) => haystack.includes(padded(hint)))) {
    return REMOTE_CODE;
  }

  return null;
}

/** Thứ tự: từ khoá chính trong tiêu đề → nhãn ngành của portal (hay lẫn ngành của CÔNG TY) → từ khoá dự phòng trong tiêu đề → thẻ; trả `OTHER` chứ không `null`. */
export function resolveOccupation(
  title: string,
  tags: string[],
  categories: string[] = [],
): string {
  const haystack = occupationHaystack(title);

  return (
    firstMatch(haystack, OCCUPATIONS) ??
    occupationFromCategories(categories) ??
    firstMatch(haystack, FALLBACKS) ??
    matchOccupation(occupationHaystack(tags.join(' '))) ??
    OTHER_CODE
  );
}

const occupationHaystack = (text: string) =>
  padded(normalizeText(text)).replaceAll(' thuong mai dien tu ', ' ecommerce ');

const PREFIX_MIN_LENGTH = 4;

const CATEGORY_OCCUPATION = new Map(
  Object.entries(PORTAL_CATEGORY_OCCUPATION).map(([label, code]) => [
    normalizeText(label),
    code,
  ]),
);

function occupationFromCategories(categories: string[]): string | null {
  for (const label of categories) {
    const key = normalizeText(label);
    if (!key) continue;
    if (CATEGORY_OCCUPATION.has(key)) {
      const code = CATEGORY_OCCUPATION.get(key);
      if (code) return code;
      continue;
    }
    const matched = matchOccupation(occupationHaystack(key));
    if (matched) return matched;
  }
  return null;
}

const FALLBACKS = OCCUPATIONS.map((occupation) => ({
  code: occupation.code,
  keywords: occupation.fallbackKeywords ?? [],
}));

function matchOccupation(haystack: string): string | null {
  return firstMatch(haystack, OCCUPATIONS) ?? firstMatch(haystack, FALLBACKS);
}

function firstMatch(
  haystack: string,
  entries: { code: string; keywords: string[] }[],
): string | null {
  const tokens = haystack.trim().split(' ');

  for (const entry of entries) {
    const hit = entry.keywords.some(
      (word) =>
        haystack.includes(padded(word)) ||
        (word.length >= PREFIX_MIN_LENGTH &&
          !word.includes(' ') &&
          tokens.some((token) => token.startsWith(word))),
    );
    if (hit) return entry.code;
  }
  return null;
}

export function resolveSubOccupation(
  occupationCode: string,
  title: string,
  tags: string[],
): string | null {
  const subs = SUB_OCCUPATIONS[occupationCode];
  if (!subs?.length) return null;

  const fromTitle = firstMatch(padded(normalizeText(title)), subs);
  if (fromTitle) return fromTitle;

  return firstMatch(padded(normalizeText(tags.join(' '))), subs);
}

export function buildSearchText(
  title: string,
  company: string,
  tags: string[],
): string {
  return normalizeText([title, company, ...tags].join(' '));
}

/** Trọn bộ cột dẫn xuất của một tin — đường ghi tin chỉ nên gọi hàm này. */
export function derivedFields(
  title: string,
  company: string,
  location: string | null | undefined,
  tags: string[],
  categories: string[] = [],
  salaryRaw: string | null = null,
): ParsedSalary & {
  provinceCode: string | null;
  occupationCode: string;
  subOccupationCode: string | null;
  searchText: string;
  dedupeKey: string | null;
} {
  const provinceCode = resolveProvince(location ?? null);
  const occupationCode = resolveOccupation(title, tags, categories);

  return {
    provinceCode,
    occupationCode,
    subOccupationCode: resolveSubOccupation(occupationCode, title, [
      ...categories,
      ...tags,
    ]),
    searchText: buildSearchText(title, company, tags),
    dedupeKey: dedupeKeyOf(title, company, provinceCode),
    ...parseSalary(salaryRaw),
  };
}
