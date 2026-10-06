import { normalizeText } from '@/common/text/vietnamese';
import { dedupeKeyOf } from './dedupe';
import { OCCUPATIONS, OTHER_CODE } from './occupations';
import { PROVINCES, REMOTE_CODE } from './provinces';
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

/** Tiêu đề xét TRƯỚC thẻ (portal gắn "IT" cho tin kế toán ở công ty phần mềm); trả `OTHER` chứ không `null`. */
export function resolveOccupation(title: string, tags: string[]): string {
  const fromTitle = matchOccupation(padded(normalizeText(title)));
  if (fromTitle) return fromTitle;

  const fromTags = matchOccupation(padded(normalizeText(tags.join(' '))));
  return fromTags ?? OTHER_CODE;
}

const PREFIX_MIN_LENGTH = 4;

function matchOccupation(haystack: string): string | null {
  return firstMatch(haystack, OCCUPATIONS);
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
): {
  provinceCode: string | null;
  occupationCode: string;
  subOccupationCode: string | null;
  searchText: string;
  dedupeKey: string | null;
} {
  const provinceCode = resolveProvince(location ?? null);
  const occupationCode = resolveOccupation(title, tags);

  return {
    provinceCode,
    occupationCode,
    subOccupationCode: resolveSubOccupation(occupationCode, title, tags),
    searchText: buildSearchText(title, company, tags),
    dedupeKey: dedupeKeyOf(title, company, provinceCode),
  };
}
