import {
  DEFAULT_PAGE_SIZE,
  type PaginationQueryDto,
} from './dto/pagination.dto';

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function pageArgs(query: PaginationQueryDto = {}): {
  take: number;
  skip: number;
} {
  return { take: query.limit ?? DEFAULT_PAGE_SIZE, skip: query.offset ?? 0 };
}

export function pageFromArray<T>(
  all: T[],
  query: PaginationQueryDto = {},
): Page<T> {
  const { take, skip } = pageArgs(query);
  return pageOf(all.slice(skip, skip + take), all.length, query);
}

export function pageOf<T>(
  items: T[],
  total: number,
  query: PaginationQueryDto = {},
): Page<T> {
  const { take, skip } = pageArgs(query);
  return { items, total, limit: take, offset: skip };
}
