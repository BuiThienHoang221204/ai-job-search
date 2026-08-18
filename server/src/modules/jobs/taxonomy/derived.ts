import {
  buildSearchText,
  resolveOccupation,
  resolveProvince,
} from './resolve.js';

/**
 * Ba trường dẫn xuất của một tin, tính một lượt.
 *
 * Gom vào một hàm để mọi đường ghi tin - dán tay qua `POST /jobs` và quét tự
 * động qua `scraper.service` - đều nhận đủ cả ba. Thiếu một trường ở một đường
 * ghi nghĩa là tin vào bằng đường đó lặng lẽ biến mất khỏi bộ lọc.
 */
export function derivedFields(
  title: string,
  company: string,
  location: string | null | undefined,
  tags: string[],
): {
  provinceCode: string | null;
  occupationCode: string;
  searchText: string;
} {
  return {
    provinceCode: resolveProvince(location ?? null),
    occupationCode: resolveOccupation(title, tags),
    searchText: buildSearchText(title, company, tags),
  };
}
