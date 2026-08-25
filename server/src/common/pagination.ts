import {
  DEFAULT_PAGE_SIZE,
  type PaginationQueryDto,
} from './dto/pagination.dto.js';

/**
 * Hình dạng chung của mọi response danh sách. `total` là tổng thật trên toàn
 * bộ tập đã lọc, KHÔNG phải độ dài của `items` - đó là thứ client cần để biết
 * còn trang nào phía sau.
 */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Áp mặc định rồi đổi sang đúng tên tham số Prisma. */
export function pageArgs(query: PaginationQueryDto = {}): {
  take: number;
  skip: number;
} {
  return { take: query.limit ?? DEFAULT_PAGE_SIZE, skip: query.offset ?? 0 };
}

/** Gói kết quả `findMany` + `count` lại thành một trang. */
export function pageOf<T>(
  items: T[],
  total: number,
  query: PaginationQueryDto = {},
): Page<T> {
  const { take, skip } = pageArgs(query);
  return { items, total, limit: take, offset: skip };
}
