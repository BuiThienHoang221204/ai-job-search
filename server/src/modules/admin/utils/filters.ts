import type { Prisma } from '@/generated/prisma/client';
import type { FailuresQueryDto } from '../admin.dto';

/** Khoảng `[from, to)` cho một cột thời gian; `undefined` khi không lọc — Prisma bỏ qua khoá mang giá trị đó. */
export function dateRange(range: {
  from?: string;
  to?: string;
}): { gte?: Date; lt?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: new Date(range.from) } : {}),
    ...(range.to ? { lt: new Date(range.to) } : {}),
  };
}

/** Portal đã gỡ khỏi registry vẫn còn lượt cũ trong DB; giữ chúng thì giao diện báo động giả mãi mãi. */
export function registeredOnly<T extends { portal: string }>(
  rows: T[],
  portals: string[],
): T[] {
  const registered = new Set(portals);
  return rows.filter((row) => registered.has(row.portal));
}

/** Điều kiện "lời gọi hỏng trong khoảng [from, to)" dùng chung cho nhật ký lỗi và bộ lọc của nó. */
export function failureWindow(range: { from?: string; to?: string }) {
  return { ok: false, createdAt: dateRange(range) };
}

/** Bộ lọc nhật ký lỗi; `OTHER` lấy cả `failureKind = null` vì giao diện hiện null là OTHER. */
export function failuresWhere(
  query: FailuresQueryDto,
): Prisma.AiCallWhereInput {
  const kind =
    query.failureKind === 'OTHER'
      ? { OR: [{ failureKind: 'OTHER' as const }, { failureKind: null }] }
      : query.failureKind
        ? { failureKind: query.failureKind }
        : {};
  const model = query.model
    ? {
        AND: [
          {
            OR: [
              {
                modelId: {
                  contains: query.model,
                  mode: 'insensitive' as const,
                },
              },
              {
                provider: {
                  contains: query.model,
                  mode: 'insensitive' as const,
                },
              },
            ],
          },
        ],
      }
    : {};
  return {
    ...failureWindow(query),
    ...kind,
    ...(query.purpose ? { purpose: query.purpose } : {}),
    ...model,
  };
}
