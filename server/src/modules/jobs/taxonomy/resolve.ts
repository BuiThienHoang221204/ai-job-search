import { OCCUPATIONS, OTHER_CODE } from './occupations.js';
import { PROVINCES, REMOTE_CODE } from './provinces.js';
import { SUB_OCCUPATIONS } from './sub-occupations.js';

/**
 * Hạ chữ thường, bỏ dấu tiếng Việt, gộp mọi thứ không phải chữ và số về một dấu
 * cách. Là dạng chuẩn duy nhất mà cả ba hàm dưới đây và cột `searchText` cùng
 * dùng - hai bên chuẩn hoá khác nhau thì ô tìm kiếm không bao giờ khớp.
 *
 * `đ` phải xử lý riêng: nó không phải `d` có dấu phụ nên `normalize('NFD')`
 * không tách ra được.
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Bọc bằng dấu cách để so khớp theo TỪ, không phải theo chuỗi con bất kỳ. */
const padded = (value: string) => ` ${value} `;

const REMOTE_HINTS = ['remote', 'lam viec tu xa', 'tu xa', 'work from home'];

/**
 * Suy mã tỉnh/thành từ chuỗi địa điểm thô của portal.
 *
 * Trả `null` khi không chắc, KHÔNG đoán bừa: một tin bị gán sai tỉnh sẽ nổi lên
 * trong bộ lọc của người ở tỉnh khác, còn tin không gán thì chỉ vắng mặt - sai
 * kiểu thứ hai dễ phát hiện và ít gây hại hơn.
 */
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

/**
 * Suy mã nhóm ngành từ tiêu đề và thẻ của tin.
 *
 * Tiêu đề được xét TRƯỚC toàn bộ thẻ: thẻ là thứ portal gắn rộng tay ("IT" trên
 * một tin tuyển kế toán cho công ty phần mềm), còn tiêu đề là thứ nhà tuyển
 * dụng phải viết đúng. Trả `OTHER` chứ không trả `null` - mọi tin đều thuộc một
 * ngành nào đó, và "khác" là một lựa chọn hợp lệ trên bộ lọc.
 */
export function resolveOccupation(title: string, tags: string[]): string {
  const fromTitle = matchOccupation(padded(normalizeText(title)));
  if (fromTitle) return fromTitle;

  const fromTags = matchOccupation(padded(normalizeText(tags.join(' '))));
  return fromTags ?? OTHER_CODE;
}

/**
 * Khớp theo TỪ, cộng thêm khớp theo TIỀN TỐ cho từ khoá một chữ.
 *
 * Chỉ khớp trọn từ thì thẻ `ReactJS`, `NodeJS`, `VueJS` - đúng dạng portal hay
 * gắn - đều trượt, vì `reactjs` là một từ chứ không phải `react` + `js`. Tiền
 * tố chỉ mở cho từ khoá từ bốn ký tự trở lên: dưới mức đó thì `pr` sẽ nuốt
 * `production` và mọi tin sản xuất rơi vào nhóm truyền thông.
 */
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

/**
 * Văn bản mà ô tìm kiếm chạy `LIKE` lên. Gộp tiêu đề, công ty và thẻ vì đó là
 * ba thứ người dùng gõ vào ô tìm kiếm; KHÔNG gộp `description` - mô tả dài tới
 * 60KB sẽ làm index trigram phình ra và khiến gần như mọi từ khoá đều khớp.
 */
export function buildSearchText(
  title: string,
  company: string,
  tags: string[],
): string {
  return normalizeText([title, company, ...tags].join(' '));
}
