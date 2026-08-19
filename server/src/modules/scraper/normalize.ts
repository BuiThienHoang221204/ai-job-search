import type {
  PortalJobCard,
  PortalJobDetail,
} from './services/portal-cli.service.js';

/** Chuẩn hoá đầu ra của các portal CLI về một hình dạng duy nhất. */

/** Bóc mảng kết quả ra khỏi bao bì, dù CLI gói kiểu nào. */
export function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== 'object' || payload === null) return [];

  for (const key of ['results', 'jobs', 'data', 'items']) {
    const value = (payload as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** Suy `slug` khi CLI không trả về. */
const slugOf = (row: Record<string, unknown>): string | null =>
  text(row.slug) ?? text(row.id) ?? null;

/** Chuẩn hoá một thẻ việc làm. Trả null nếu thiếu thứ không thể suy ra được. */
export function normalizeCard(input: unknown): PortalJobCard | null {
  if (typeof input !== 'object' || input === null) return null;
  const row = input as Record<string, unknown>;

  const id = text(row.id);
  const slug = slugOf(row);
  const title = text(row.title);
  const url = text(row.url);
  if (!id || !slug || !title || !url) return null;

  return {
    id,
    slug,
    title,
    url,
    company: text(row.company),
    companyUrl: text(row.companyUrl),
    companyLogo: text(row.companyLogo),
    location: text(row.location),
    workMode: text(row.workMode),
    salary: text(row.salary),
    postedAt: text(row.postedAt) ?? text(row.date),
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    ...(text(row.description) ? { description: text(row.description) } : {}),
  };
}

export function normalizeCards(payload: unknown): PortalJobCard[] {
  return unwrapList(payload)
    .map(normalizeCard)
    .filter((card): card is PortalJobCard => card !== null);
}

/** Chuẩn hoá một tin chi tiết. `detail` luôn trả về một object, không phải mảng. */
export function normalizeDetail(payload: unknown): PortalJobDetail | null {
  const card = normalizeCard(payload);
  if (!card) return null;

  const row = payload as Record<string, unknown>;
  return { ...card, description: text(row.description) };
}

/** Bốn portal nói ngày đăng theo bốn kiểu, và không kiểu nào là timestamp. */
const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000, // 30 ngày; đủ dùng cho một nhãn "x tháng trước"
  year: 31_536_000_000,
};

/**
 * Từ chỉ đơn vị -> khoá trong UNIT_MS. Nhận cả tiếng Anh lẫn tiếng Việt:
 * portal đổi ngôn ngữ theo header `Accept-Language` mà backend không điều
 * khiển được, nên nhận cả hai rẻ hơn là đi tìm lỗi khi nó đổi.
 */
const UNIT_WORDS: Record<string, keyof typeof UNIT_MS> = {
  minute: 'minute',
  minutes: 'minute',
  phut: 'minute',
  hour: 'hour',
  hours: 'hour',
  gio: 'hour',
  day: 'day',
  days: 'day',
  ngay: 'day',
  week: 'week',
  weeks: 'week',
  tuan: 'week',
  month: 'month',
  months: 'month',
  thang: 'month',
  year: 'year',
  years: 'year',
  nam: 'year',
};

/** Bỏ dấu tiếng Việt để "ngày" và "ngay" cùng khớp một khoá. */
const stripDiacritics = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

/**
 * "4 days ago" / "2 giờ trước" -> mốc thời gian. Trả null nếu không phải dạng
 * tương đối.
 */
function parseRelative(value: string, now: Date): Date | null {
  const normalized = stripDiacritics(value).toLowerCase();

  const match = normalized.match(
    /(?:^|\s)(\d+)?\s*(minute|minutes|phut|hour|hours|gio|day|days|ngay|week|weeks|tuan|month|months|thang|year|years|nam)\b/,
  );
  if (!match) return null;

  if (!/\bago\b|truoc|qua/.test(normalized)) return null;

  const amount = match[1] ? Number(match[1]) : 1;
  if (!Number.isFinite(amount) || amount < 0) return null;

  return new Date(now.getTime() - amount * UNIT_MS[UNIT_WORDS[match[2]]]);
}

/** Ngày tuyệt đối: ISO ("2025-07-21", "2025-07-21T09:00:00Z") hoặc dd/mm/yyyy. */
function parseAbsolute(value: string): Date | null {
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return new Date(Date.UTC(+year, +month - 1, +day));
  }

  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Đổi chuỗi ngày đăng của portal thành mốc thời gian. */
export function parsePostedAt(
  value: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  const raw = text(value);
  if (!raw) return null;

  const parsed = parseAbsolute(raw) ?? parseRelative(raw, now);
  if (!parsed) return null;

  if (parsed.getTime() > now.getTime() + UNIT_MS.day) return null;
  return parsed;
}

/**
 * Tin có nằm trong `days` ngày gần nhất không.
 *
 * Không đọc được ngày đăng thì `strict` quyết định: mặc định GIỮ, vì ITviec và
 * TopCV thỉnh thoảng không in nhãn ngày và loại sạch sẽ mất tin thật.
 */
export function withinDays(
  value: string | null | undefined,
  days: number,
  strict = false,
  now: Date = new Date(),
): boolean {
  const postedAt = parsePostedAt(value, now);
  if (!postedAt) return !strict;
  return now.getTime() - postedAt.getTime() <= days * UNIT_MS.day;
}
