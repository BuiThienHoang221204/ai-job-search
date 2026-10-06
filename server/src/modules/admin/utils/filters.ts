import type { Prisma } from '@/generated/prisma/client';
import type { FailuresQueryDto } from '../admin.dto';

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

export function registeredOnly<T extends { portal: string }>(
  rows: T[],
  portals: string[],
): T[] {
  const registered = new Set(portals);
  return rows.filter((row) => registered.has(row.portal));
}

export function failureWindow(range: { from?: string; to?: string }) {
  return { ok: false, createdAt: dateRange(range) };
}

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
