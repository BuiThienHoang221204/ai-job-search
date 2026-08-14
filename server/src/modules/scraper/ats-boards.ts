import type { PortalJobCard } from './portal-cli.service.js';

/**
 * Ba hệ ATS, và đây là **hàm thuần** — không fetch, không log, không Nest.
 *
 * Tách như vậy để chuẩn hoá dữ liệu kiểm được không cần mạng: một trang tuyển dụng
 * đổi hình dạng JSON là chuyện xảy ra thật, và test phải bắt được nó bằng dữ liệu mẫu
 * chứ không bằng cách gọi ra Internet trong CI.
 */
export type AtsVendor = 'greenhouse' | 'lever' | 'ashby';

/// Một board cụ thể: hệ ATS nào, của công ty nào.
export interface AtsBoard {
  vendor: AtsVendor;
  /// Slug công ty trong URL API, ví dụ `greenhouse` trong
  /// `boards-api.greenhouse.io/v1/boards/greenhouse/jobs`.
  company: string;
}

/**
 * URL API cho một board.
 *
 * Cả ba đều là API **công khai, có tài liệu**, không cần key — đã kiểm từng cái trả
 * HTTP 200. Đó là lý do chúng được chọn: đọc chúng không phải scrape, nên không có
 * vấn đề ToS như LinkedIn (xem `LO-TRINH.md` mục 4).
 *
 * `content=true` của Greenhouse là bắt buộc: thiếu nó thì `content` vắng và ta phải
 * gọi thêm một request cho từng tin. Lever và Ashby trả mô tả sẵn trong danh sách.
 */
export function boardUrl(board: AtsBoard): string {
  const company = encodeURIComponent(board.company);
  switch (board.vendor) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;
    case 'lever':
      return `https://api.lever.co/v0/postings/${company}?mode=json`;
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${company}`;
  }
}

/// `greenhouse:acme` → `{ vendor, company }`. Trả `null` khi chuỗi không dùng được,
/// để caller ghi log và bỏ qua đúng board đó chứ không làm hỏng cả cấu hình.
export function parseBoard(raw: string): AtsBoard | null {
  const [vendor, company] = raw.trim().split(':');
  if (!company) return null;
  if (vendor !== 'greenhouse' && vendor !== 'lever' && vendor !== 'ashby') {
    return null;
  }
  return { vendor, company: company.trim() };
}

/// Đọc danh sách board từ một chuỗi cấu hình `greenhouse:acme,lever:beta`.
export function parseBoards(raw: string | undefined): AtsBoard[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => parseBoard(item))
    .filter((board): board is AtsBoard => board !== null);
}

/**
 * HTML → văn bản thuần.
 *
 * Greenhouse trả `content` là HTML **đã escape entity** (`&lt;p&gt;`), nên phải giải
 * entity TRƯỚC rồi mới bỏ thẻ — làm ngược lại thì `&lt;p&gt;` biến thành `<p>` và nằm
 * lại trong mô tả, rồi trôi thẳng vào prompt gửi lên model.
 *
 * Không dùng thư viện parse HTML: mô tả này đi vào prompt và vào PDF, nên chỉ cần văn
 * bản. Một parser đầy đủ thêm một phụ thuộc để giải một việc mà bốn phép thay là đủ.
 */
export function htmlToText(input: string): string {
  return (
    input
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      // `&amp;` phải làm CUỐI trong nhóm entity: làm trước thì `&amp;lt;` thành `&lt;`
      // rồi thành `<`, tức là một dấu `&` trong văn bản gốc biến thành một thẻ.
      .replace(/&amp;/g, '&')
      // Thẻ ngắt dòng thành ngắt dòng thật, để đoạn văn không dính liền nhau.
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
}

/// Đọc một trường chuỗi, trả `null` thay vì ném: JSON đến từ máy chủ của người khác.
const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

/**
 * Đọc một định danh: chỉ nhận chuỗi hoặc SỐ.
 *
 * Greenhouse trả `id` là số, hai hệ kia trả chuỗi. Nhưng `String(unknown)` trên một
 * object cho ra `[object Object]` — và giá trị đó sẽ đi vào `Job.externalId`, nơi nó
 * làm mọi tin của board đó gộp thành một bản ghi. eslint bắt đúng chỗ này
 * (`no-base-to-string`); danh sách trắng theo kiểu mới là bản sửa, không phải một
 * dòng `eslint-disable`.
 */
const id = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return str(value);
};

/**
 * Chuẩn hoá JSON của một hệ ATS thành `PortalJobCard[]`.
 *
 * `slug` được đặt bằng chính `id`: `ScraperService` dùng `slug` để gọi `detail()`, mà
 * ba hệ này đã trả mô tả sẵn nên `detail()` không bao giờ được gọi tới. Đặt `slug` để
 * hợp đồng của seam vẫn đúng, không phải để dùng.
 *
 * Tin nào KHÔNG có mô tả thì bị bỏ ngay ở đây: toàn bộ khung chấm điểm dựa trên yêu
 * cầu công việc, nên một tin không mô tả là một bản ghi vô dụng trong database.
 */
export function normalizeAtsJobs(
  board: AtsBoard,
  payload: unknown,
): PortalJobCard[] {
  const rows = rowsOf(board.vendor, payload);
  const cards: PortalJobCard[] = [];

  for (const row of rows) {
    const card = toCard(board, row);
    if (card && card.description && card.description.length >= 80) {
      cards.push(card);
    }
  }
  return cards;
}

function rowsOf(
  vendor: AtsVendor,
  payload: unknown,
): Record<string, unknown>[] {
  const asRows = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null,
        )
      : [];

  if (vendor === 'lever') return asRows(payload);
  // Greenhouse và Ashby đều bọc trong `{ jobs: [...] }`.
  return asRows((payload as { jobs?: unknown } | null)?.jobs);
}

function toCard(
  board: AtsBoard,
  row: Record<string, unknown>,
): PortalJobCard | null {
  switch (board.vendor) {
    case 'greenhouse':
      return greenhouseCard(board, row);
    case 'lever':
      return leverCard(board, row);
    case 'ashby':
      return ashbyCard(board, row);
  }
}

/// Khung chung: mọi card đều cần đủ id/url/title, còn lại là tuỳ nguồn.
const base = (
  id: string,
  url: string,
  title: string,
  company: string,
): PortalJobCard => ({
  id,
  slug: id,
  title,
  company,
  companyUrl: null,
  // Ba hệ ATS không trả logo công ty. Giao diện tự lùi về ô chữ cái đầu.
  companyLogo: null,
  location: null,
  workMode: null,
  salary: null,
  postedAt: null,
  tags: [],
  url,
  description: null,
});

function greenhouseCard(
  board: AtsBoard,
  row: Record<string, unknown>,
): PortalJobCard | null {
  const jobId = id(row.id);
  const url = str(row.absolute_url);
  const title = str(row.title);
  if (!jobId || !url || !title) return null;

  const location = (row.location as { name?: unknown } | null)?.name;
  const departments = Array.isArray(row.departments)
    ? row.departments
        .map((d) => str((d as { name?: unknown }).name))
        .filter((name): name is string => name !== null)
    : [];

  return {
    ...base(jobId, url, title, str(row.company_name) ?? board.company),
    location: str(location),
    postedAt: str(row.first_published) ?? str(row.updated_at),
    tags: departments.slice(0, 5),
    description: str(row.content) ? htmlToText(String(row.content)) : null,
  };
}

function leverCard(
  board: AtsBoard,
  row: Record<string, unknown>,
): PortalJobCard | null {
  const jobId = id(row.id);
  const url = str(row.hostedUrl) ?? str(row.applyUrl);
  const title = str(row.text);
  if (!jobId || !url || !title) return null;

  const categories = (row.categories ?? {}) as Record<string, unknown>;

  return {
    ...base(jobId, url, title, board.company),
    location: str(categories.location),
    workMode: str(row.workplaceType),
    // `createdAt` của Lever là số mili-giây, không phải chuỗi ISO.
    postedAt:
      typeof row.createdAt === 'number'
        ? new Date(row.createdAt).toISOString()
        : null,
    tags: [str(categories.department), str(categories.team)].filter(
      (tag): tag is string => tag !== null,
    ),
    description: str(row.descriptionPlain) ?? str(row.description),
  };
}

function ashbyCard(
  board: AtsBoard,
  row: Record<string, unknown>,
): PortalJobCard | null {
  const jobId = id(row.id);
  const url = str(row.jobUrl) ?? str(row.applyUrl);
  const title = str(row.title);
  if (!jobId || !url || !title) return null;

  // `isListed: false` nghĩa là tin không còn hiện trên trang tuyển dụng của họ.
  if (row.isListed === false) return null;

  return {
    ...base(jobId, url, title, board.company),
    location: str(row.location),
    workMode: row.isRemote === true ? 'remote' : str(row.workplaceType),
    postedAt: str(row.publishedAt),
    tags: [str(row.department), str(row.team)].filter(
      (tag): tag is string => tag !== null,
    ),
    description: str(row.descriptionPlain),
  };
}
