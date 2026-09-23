import type {
  CollectDeps,
  CollectOutcome,
  PlannedQuery,
  PortalJobCard,
  QueryCursor,
} from '../types.js';
import { withinDays } from './normalize.js';

/** Số tin xin cho MỘT request, không phải trần cả lượt — trần đó là `limits.maxJobsPerPortal`, gom qua nhiều trang. */
const PAGE_SIZE = 25;

/** CHIA ĐỀU hạn ngạch cho mọi truy vấn: bản cũ để truy vấn đầu lấy trọn 50 suất, mà mỗi truy vấn là một NGÀNH. */
export async function collectCards(
  deps: CollectDeps,
  portal: string,
  queries: PlannedQuery[],
): Promise<CollectOutcome> {
  const { limits } = deps;
  const seen = new Map<string, PortalJobCard>();
  const cursors: QueryCursor[] = queries.map((query) => ({
    query,
    page: 1,
    taken: 0,
    done: false,
    pending: [],
    gained: 0,
    requested: false,
  }));
  let stale = 0;

  const quota = Math.max(
    1,
    Math.floor(limits.maxJobsPerPortal / Math.max(1, cursors.length)),
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

  const askedIndices = cursors.flatMap((cursor, index) =>
    cursor.requested ? [index] : [],
  );
  if (askedIndices.length < cursors.length) {
    deps.log(
      `${portal}: ${cursors.length - askedIndices.length}/${cursors.length} truy vấn không gửi được request nào vì đã đầy trần tin`,
    );
  }

  return {
    cards: [...seen.values()].slice(0, limits.maxJobsPerPortal),
    askedIndices,
  };
}

/** `done` chỉ khi một trang tiêu thụ HẾT mà không thêm được tin nào — portal Việt không cam kết sắp theo ngày đăng. */
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
    cursor.requested = true;
    const cards = await deps.search(portal, {
      query: cursor.query.query,
      location: cursor.query.location || limits.defaultLocation,
      page,
      limit: PAGE_SIZE,
      postedWithinDays: limits.maxAgeDays,
    });
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
