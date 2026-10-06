import { HOUR_MS } from '@/common/duration';
export interface UsageGroup {
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface UsageRow extends UsageGroup {
  totalTokens: number;
}

export interface GroupedSums {
  _count: { _all: number };
  _sum: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedTokens: number | null;
  };
}

export const toUsageRow = (group: GroupedSums, failed = 0): UsageRow => {
  const inputTokens = group._sum.inputTokens ?? 0;
  const outputTokens = group._sum.outputTokens ?? 0;
  return {
    calls: group._count._all,
    failed,
    inputTokens,
    outputTokens,
    cachedTokens: group._sum.cachedTokens ?? 0,
    totalTokens: inputTokens + outputTokens,
  };
};

export function withFailed<K extends string>(
  key: K,
  all: Array<GroupedSums & Record<K, string | null>>,
  failed: Array<{ _count: { _all: number } } & Record<K, string | null>>,
): Array<UsageRow & Record<K, string | null>> {
  const failedBy = new Map(failed.map((row) => [row[key], row._count._all]));
  return all.map((row) => ({
    ...toUsageRow(row, failedBy.get(row[key]) ?? 0),
    [key]: row[key],
  })) as Array<UsageRow & Record<K, string | null>>;
}

export const byTokensDesc = <T extends UsageRow>(rows: T[]): T[] =>
  [...rows].sort((a, b) => b.totalTokens - a.totalTokens || b.calls - a.calls);

export type Granularity = 'hour' | 'day';

export interface BucketRow {
  bucket: string;
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
}

const VN_OFFSET_MS = 7 * HOUR_MS;

export const granularityFor = (days: number): Granularity =>
  days <= 1 ? 'hour' : 'day';

export const PG_BUCKET_FORMAT: Record<Granularity, string> = {
  day: 'YYYY-MM-DD',
  hour: 'YYYY-MM-DD"T"HH24',
};

export const vnBucket = (date: Date, granularity: Granularity): string =>
  new Date(date.getTime() + VN_OFFSET_MS)
    .toISOString()
    .slice(0, granularity === 'day' ? 10 : 13);

/** Đầu ô đầu tiên theo giờ Việt Nam, để tổng số và biểu đồ đếm cùng một tập lời gọi. */
export function windowStart(days: number, now = new Date()): Date {
  const granularity = granularityFor(days);
  const local = new Date(now.getTime() + VN_OFFSET_MS);
  if (granularity === 'hour') {
    local.setUTCMinutes(0, 0, 0);
    return new Date(local.getTime() - VN_OFFSET_MS - 23 * HOUR_MS);
  }
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - VN_OFFSET_MS - (days - 1) * 24 * HOUR_MS);
}

/** Điền đủ các ô của cửa sổ; ô không có lời gọi ra 0 thay vì biến mất. */
export function fillBuckets(
  rows: BucketRow[],
  days: number,
  now = new Date(),
): BucketRow[] {
  const granularity = granularityFor(days);
  const step = granularity === 'day' ? 24 * HOUR_MS : HOUR_MS;
  const count = granularity === 'day' ? days : 24;
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));
  const out: BucketRow[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const bucket = vnBucket(
      new Date(now.getTime() - offset * step),
      granularity,
    );
    out.push(
      byBucket.get(bucket) ?? {
        bucket,
        calls: 0,
        failed: 0,
        inputTokens: 0,
        outputTokens: 0,
      },
    );
  }
  return out;
}
