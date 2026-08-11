import type { PortalJobCard, PortalJobDetail } from './portal-cli.service.js';

/// Chuẩn hoá đầu ra của các portal CLI về một hình dạng duy nhất.
///
/// Bốn CLI hiện có KHÔNG cùng giao diện, và điều đó là chuyện phải chấp nhận:
/// `linkedin-search` đến từ framework upstream nên sửa nó sẽ xung đột mỗi lần
/// đồng bộ. Chỗ đúng để hoá giải khác biệt là ở đây - lớp tiếp giáp giữa CLI
/// và backend - chứ không phải bắt mọi CLI phải giống nhau.
///
/// Hai khác biệt đã gặp thật:
/// - itviec/topcv/vietnamworks trả MẢNG; linkedin trả `{ meta, results }`.
/// - linkedin dùng `date` thay cho `postedAt`, và không có `slug`, `salary`,
///   `tags`, `workMode`.

/// Bóc mảng kết quả ra khỏi bao bì, dù CLI gói kiểu nào.
export function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== 'object' || payload === null) return [];

  // Các tên bao bì đã gặp hoặc dễ gặp. Duyệt theo thứ tự cố định để hai CLI
  // cùng có `results` và `data` không cho ra kết quả khác nhau tuỳ lần chạy.
  for (const key of ['results', 'jobs', 'data', 'items']) {
    const value = (payload as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/// Suy `slug` khi CLI không trả về.
///
/// `slug` là thứ backend truyền lại cho lệnh `detail`, nên phải là chuỗi mà
/// chính CLI đó nhận lại được. CLI của LinkedIn nhận id dạng số, nên dùng id.
const slugOf = (row: Record<string, unknown>): string | null =>
  text(row.slug) ?? text(row.id) ?? null;

/// Chuẩn hoá một thẻ việc làm. Trả null nếu thiếu thứ không thể suy ra được.
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
    // linkedin gọi trường này là `date`.
    postedAt: text(row.postedAt) ?? text(row.date),
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    // Chỉ đặt khi CLI thật sự trả về: ScraperService phân biệt "có sẵn mô tả"
    // với "chưa lấy" để quyết định có gọi `detail` hay không. Đặt null vô tội
    // vạ ở đây sẽ khiến nó gọi detail cả với portal đã có sẵn mô tả.
    ...(text(row.description) ? { description: text(row.description) } : {}),
  };
}

export function normalizeCards(payload: unknown): PortalJobCard[] {
  return unwrapList(payload)
    .map(normalizeCard)
    .filter((card): card is PortalJobCard => card !== null);
}

/// Chuẩn hoá một tin chi tiết. `detail` luôn trả về một object, không phải mảng.
export function normalizeDetail(payload: unknown): PortalJobDetail | null {
  const card = normalizeCard(payload);
  if (!card) return null;

  const row = payload as Record<string, unknown>;
  return { ...card, description: text(row.description) };
}

/// Bốn portal nói ngày đăng theo bốn kiểu, và không kiểu nào là timestamp.
///
/// - itviec:        "1 day ago", "4 days ago"   (TIẾNG ANH, lấy từ regex
///                                               `Posted (…ago)` trong CLI)
/// - linkedin:      "2025-07-21"                (chỉ ngày, không giờ)
/// - vietnamworks:  `prettyApprovedOn ?? approvedOn` từ API JSON
/// - topcv:         không trả gì, luôn null
///
/// Hoá giải ở đây chứ không sửa từng CLI: `linkedin-search` đến từ framework
/// upstream nên mọi thay đổi trong đó sẽ xung đột mỗi lần đồng bộ.
const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000, // 30 ngày; đủ dùng cho một nhãn "x tháng trước"
  year: 31_536_000_000,
};

/// Từ chỉ đơn vị -> khoá trong UNIT_MS. Nhận cả tiếng Anh lẫn tiếng Việt:
/// portal đổi ngôn ngữ theo header `Accept-Language` mà backend không điều
/// khiển được, nên nhận cả hai rẻ hơn là đi tìm lỗi khi nó đổi.
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

/// Bỏ dấu tiếng Việt để "ngày" và "ngay" cùng khớp một khoá.
///
/// KHÔNG liệt kê biến thể có dấu bằng tay: ký tự trong mã nguồn và trong dữ
/// liệu có thể ở hai dạng chuẩn hoá Unicode khác nhau, khi đó so sánh trượt mà
/// không báo gì.
const stripDiacritics = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

/// "4 days ago" / "2 giờ trước" -> mốc thời gian. Trả null nếu không phải dạng
/// tương đối.
function parseRelative(value: string, now: Date): Date | null {
  const normalized = stripDiacritics(value).toLowerCase();

  // "a day ago" và "an hour ago" nghĩa là 1. Không có số thì mặc định 1.
  const match = normalized.match(
    /(?:^|\s)(\d+)?\s*(minute|minutes|phut|hour|hours|gio|day|days|ngay|week|weeks|tuan|month|months|thang|year|years|nam)\b/,
  );
  if (!match) return null;

  // Chỉ chấp nhận khi có từ chỉ "quá khứ" đi kèm. Thiếu nó thì chuỗi có thể là
  // "Hạn nộp 3 ngày" - một mốc TƯƠNG LAI, và trừ đi sẽ ra ngày đăng bịa.
  if (!/\bago\b|truoc|qua/.test(normalized)) return null;

  const amount = match[1] ? Number(match[1]) : 1;
  if (!Number.isFinite(amount) || amount < 0) return null;

  return new Date(now.getTime() - amount * UNIT_MS[UNIT_WORDS[match[2]]]);
}

/// Ngày tuyệt đối: ISO ("2025-07-21", "2025-07-21T09:00:00Z") hoặc dd/mm/yyyy.
function parseAbsolute(value: string): Date | null {
  // dd/mm/yyyy - kiểu người Việt hay dùng, và Date.parse đọc nó thành mm/dd,
  // tức là 07/08 thành ngày 8 tháng 7 thay vì 7 tháng 8. Tách tay.
  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return new Date(Date.UTC(+year, +month - 1, +day));
  }

  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/// Đổi chuỗi ngày đăng của portal thành mốc thời gian.
///
/// Trả null khi không đọc được, và đó là câu trả lời ĐÚNG chứ không phải thất
/// bại: "không biết tin này đăng bao giờ" khác hẳn "tin này đăng hôm nay".
/// Giao diện có nhánh riêng cho null - nó hiện ngày thu thập kèm đúng nhãn.
///
/// `now` là tham số để test được mà không phải đóng băng đồng hồ hệ thống.
export function parsePostedAt(
  value: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  const raw = text(value);
  if (!raw) return null;

  const parsed = parseAbsolute(raw) ?? parseRelative(raw, now);
  if (!parsed) return null;

  // Tin đăng ở tương lai là dữ liệu hỏng, không phải tin sắp đăng. Cho phép
  // lệch một ngày vì portal và máy chủ có thể ở hai múi giờ khác nhau.
  if (parsed.getTime() > now.getTime() + UNIT_MS.day) return null;
  return parsed;
}
