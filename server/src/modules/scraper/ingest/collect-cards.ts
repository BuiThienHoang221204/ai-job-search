import type {
  PortalJobCard,
  SearchArgs,
} from '../sources/portal-cli.service.js';
import type { PlannedQuery } from '../planning/query-plan.js';
import { withinDays } from '../sources/normalize.js';
import { POLITE_DELAY_MS, sleep } from './pacing.js';

/**
 * Số tin xin cho MỘT request tìm kiếm. Không phải trần của cả lượt quét: trần
 * đó là `limits.maxJobsPerPortal` và được gom qua nhiều trang.
 */
const PAGE_SIZE = 25;

/** Trần của một lượt quét. Đọc từ `scraper.*` trong cấu hình. */
export type CollectLimits = {
  maxJobsPerPortal: number;
  maxPages: number;
  maxAgeDays: number;
  requirePostedAt: boolean;
  defaultLocation: string;
};

/** Những thứ việc thu thập cần từ bên ngoài. Không tự dựng cái nào. */
export type CollectDeps = {
  search: (portal: string, args: SearchArgs) => Promise<PortalJobCard[]>;
  log: (message: string) => void;
  limits: CollectLimits;
};

/** Vị trí duyệt của MỘT truy vấn, giữ qua các lượt chia hạn ngạch. */
type QueryCursor = {
  query: PlannedQuery;
  /** Trang sẽ lấy tiếp. Không quay lại từ đầu ở lượt chia phần dư. */
  page: number;
  /** Số tin truy vấn này đã đóng góp, dùng để so với hạn ngạch riêng. */
  taken: number;
  /** Đã hết tin hoặc trang cuối không thêm được gì. */
  done: boolean;
  /**
   * Thẻ đã tải về nhưng chưa nhận vì chạm hạn ngạch riêng.
   *
   * Không có đệm này thì dừng giữa trang đồng nghĩa vứt phần còn lại: con trỏ
   * đã nhảy sang trang sau, và lượt chia phần dư không có cách nào lấy lại.
   */
  pending: PortalJobCard[];
  /** Số tin nhận được từ trang đang tiêu thụ. Đặt lại mỗi lần tải trang mới. */
  gained: number;
};

/**
 * Gom thẻ tin cho một lần quét, CHIA ĐỀU hạn ngạch cho mọi truy vấn.
 *
 * Bản trước duyệt truy vấn ở vòng ngoài và thoát khi đầy hạn ngạch, nên truy
 * vấn đầu tiên lấy trọn 50 suất còn những truy vấn sau không gửi đi một request
 * nào. Với lượt quét của hệ thống - nơi mỗi truy vấn là một NGÀNH khác nhau -
 * điều đó nghĩa là chỉ một ngành được phục vụ.
 *
 * Nay mỗi truy vấn có hạn ngạch riêng, và phần dư của truy vấn cạn sớm được
 * chia lại ở lượt thứ hai.
 */
export async function collectCards(
  deps: CollectDeps,
  portal: string,
  queries: PlannedQuery[],
): Promise<PortalJobCard[]> {
  const { limits } = deps;
  const seen = new Map<string, PortalJobCard>();
  const cursors: QueryCursor[] = queries.map((query) => ({
    query,
    page: 1,
    taken: 0,
    done: false,
    pending: [],
    gained: 0,
  }));
  let stale = 0;

  const quota = Math.max(
    1,
    Math.ceil(limits.maxJobsPerPortal / Math.max(1, cursors.length)),
  );

  for (const cap of [quota, Number.POSITIVE_INFINITY]) {
    let advanced = true;

    while (advanced && seen.size < limits.maxJobsPerPortal) {
      advanced = false;

      for (const cursor of cursors) {
        if (seen.size >= limits.maxJobsPerPortal) break;
        if (cursor.done || cursor.taken >= cap) continue;
        if (cursor.page > limits.maxPages) continue;

        stale += await advance(deps, portal, cursor, seen, cap);
        advanced = true;
      }
    }
  }

  if (stale) {
    deps.log(`${portal}: bỏ ${stale} tin đăng quá ${limits.maxAgeDays} ngày`);
  }
  return [...seen.values()].slice(0, limits.maxJobsPerPortal);
}

/**
 * Đẩy một truy vấn đi tiếp: tiêu thụ phần còn tồn, hoặc tải trang mới.
 *
 * Trả về số tin bị loại vì quá hạn. Đánh dấu `done` khi một trang đã tiêu thụ
 * HẾT mà không thêm được tin nào - KHÔNG phải khi trang toàn tin cũ: ba portal
 * Việt Nam không cam kết sắp theo ngày đăng, nên một trang toàn tin quá hạn
 * không bảo đảm trang sau cũng vậy.
 */
async function advance(
  deps: CollectDeps,
  portal: string,
  cursor: QueryCursor,
  seen: Map<string, PortalJobCard>,
  cap: number,
): Promise<number> {
  const { limits } = deps;

  if (!cursor.pending.length) {
    const page = cursor.page;
    const cards = await deps.search(portal, {
      query: cursor.query.query,
      location: cursor.query.location || limits.defaultLocation,
      page,
      limit: PAGE_SIZE,
      postedWithinDays: limits.maxAgeDays,
    });
    await sleep(POLITE_DELAY_MS);
    cursor.page += 1;

    if (!cards.length) {
      cursor.done = true;
      return 0;
    }

    cursor.pending = [...cards];
    cursor.gained = 0;
    deps.log(
      `${portal} "${cursor.query.query}" trang ${page} -> ${cards.length} tin, tích lũy ${seen.size}`,
    );
  }

  let stale = 0;

  while (cursor.pending.length) {
    if (cursor.taken >= cap || seen.size >= limits.maxJobsPerPortal) break;

    const card = cursor.pending.shift()!;
    if (!withinDays(card.postedAt, limits.maxAgeDays, limits.requirePostedAt)) {
      stale += 1;
      continue;
    }
    if (seen.has(card.id)) continue;

    seen.set(card.id, card);
    cursor.taken += 1;
    cursor.gained += 1;
  }

  if (!cursor.pending.length && cursor.gained === 0) cursor.done = true;
  return stale;
}
