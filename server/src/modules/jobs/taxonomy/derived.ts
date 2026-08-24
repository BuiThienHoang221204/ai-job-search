import { dedupeKeyOf } from './dedupe.js';
import {
  buildSearchText,
  resolveOccupation,
  resolveProvince,
  resolveSubOccupation,
} from './resolve.js';

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
