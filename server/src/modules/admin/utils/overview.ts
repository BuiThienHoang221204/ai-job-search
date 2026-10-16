import { HOUR_MS } from '@/common/duration';
import type { QueueStats } from '@/modules/queue/queue.service';
import {
  fillBuckets,
  toUsageRow,
  type BucketRow,
  type Granularity,
  type GroupedSums,
} from './ai-usage';
import { registeredOnly } from './filters';
export const OVERVIEW_THRESHOLDS = {
  minSuccessRate: 80,
  minCallsForRate: 20,
  maxQueueWaiting: 50,
  scrapeStaleHours: 26,
} as const;

export type Severity = 'danger' | 'warning';

const SEVERITY_RANK: Record<Severity, number> = { danger: 0, warning: 1 };

export interface AttentionItem {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  action: string;
}

export const rate = (ok: number, total: number): number | null =>
  total === 0 ? null : Math.round((ok / total) * 1000) / 10;

export const comparableRate = (ok: number, total: number): number | null =>
  total < OVERVIEW_THRESHOLDS.minCallsForRate ? null : rate(ok, total);

export function topFailureKind(
  kinds: Array<{ kind: string | null; count: number }>,
): { kind: string; count: number } | null {
  const top = [...kinds].sort((a, b) => b.count - a.count)[0];
  return top ? { kind: top.kind ?? 'OTHER', count: top.count } : null;
}

export const previousSince = (since: Date, now = new Date()): Date =>
  new Date(since.getTime() - (now.getTime() - since.getTime()));

export interface AttentionInput {
  calls: number;
  ok: number;
  previousSuccessRate: number | null;
  topFailure: { kind: string; count: number } | null;
  failed: number;
  queueWaiting: number;
  portals: Array<{ portal: string; status: string; error: string | null }>;
  lastScrapeAt: Date | null;
  now?: Date;
}

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const t = OVERVIEW_THRESHOLDS;
  const items: AttentionItem[] = [];
  const success = rate(input.ok, input.calls);

  if (
    success !== null &&
    input.calls >= t.minCallsForRate &&
    success < t.minSuccessRate
  ) {
    const was =
      input.previousSuccessRate === null
        ? ''
        : ` (kỳ trước ${input.previousSuccessRate}%)`;
    const cause =
      input.topFailure && input.failed > 0
        ? ` ${input.topFailure.kind} chiếm ${Math.round((input.topFailure.count / input.failed) * 100)}% số lần hỏng.`
        : '';
    items.push({
      id: 'ai-success',
      severity: 'danger',
      title: `AI chỉ thành công ${success}%${was}`,
      detail: `${input.calls - input.ok}/${input.calls} lời gọi không cho ra kết quả dùng được.${cause}`,
      href: '/ai-failures',
      action: 'Xem lỗi',
    });
  }

  if (input.queueWaiting > t.maxQueueWaiting) {
    items.push({
      id: 'queue-backlog',
      severity: 'warning',
      title: `${input.queueWaiting} việc đang chờ trong hàng đợi`,
      detail: `Vượt ngưỡng ${t.maxQueueWaiting}. Worker không theo kịp lượng việc đổ vào.`,
      href: '/queues',
      action: 'Mở hàng đợi',
    });
  }

  for (const run of input.portals) {
    if (run.status !== 'FAILED') continue;
    items.push({
      id: `scrape-${run.portal}`,
      severity: 'warning',
      title: `Lượt quét gần nhất của ${run.portal} bị hỏng`,
      detail: run.error ?? 'Không có thông báo lỗi.',
      href: '/scrape',
      action: 'Xem lượt quét',
    });
  }

  const now = input.now ?? new Date();
  const staleMs = t.scrapeStaleHours * HOUR_MS;
  if (
    !input.lastScrapeAt ||
    now.getTime() - input.lastScrapeAt.getTime() > staleMs
  ) {
    items.push({
      id: 'scrape-stale',
      severity: 'warning',
      title: input.lastScrapeAt
        ? `Hơn ${t.scrapeStaleHours} giờ chưa có lượt quét nào`
        : 'Chưa từng có lượt quét nào',
      detail:
        'Cron 23h có thể đã lỡ nhịp hoặc đang tắt (SCRAPE_CRON_ENABLED=false).',
      href: '/scrape',
      action: 'Quét ngay',
    });
  }

  return items.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

export interface ErrorSampleRow {
  purpose: string;
  failureKind: string | null;
  errorMessage: string | null;
}

export interface FailureGroupRow {
  purpose: string;
  failureKind: string | null;
  _count: { _all: number };
}

export interface PortalRun {
  portal: string;
  status: string;
  jobsNew: number;
  error: string | null;
  createdAt: Date;
}

export interface OverviewInput {
  days: number;
  now: Date;
  since: Date;
  before: Date;
  granularity: Granularity;
  calls: number;
  ok: number;
  prevCalls: number;
  prevOk: number;
  tokens: GroupedSums;
  prevTokens: GroupedSums;
  newJobs: number | null;
  prevNewJobs: number | null;
  groups: Array<FailureGroupRow & { _max: { createdAt: Date | null } }>;
  prevGroups: FailureGroupRow[];
  samples: ErrorSampleRow[];
  kinds: Array<{ failureKind: string | null; _count: { _all: number } }>;
  buckets: BucketRow[];
  runs: PortalRun[];
  registeredPortals: string[];
  queue: QueueStats;
}

const groupKey = (row: { purpose: string; failureKind: string | null }) =>
  `${row.purpose}|${row.failureKind}`;

/** Dựng trang tổng quan admin từ các số đã truy vấn; không chạm database. */
export function buildOverview(input: OverviewInput) {
  const { calls, ok, days, now, queue } = input;
  const prevBy = new Map(
    input.prevGroups.map((group) => [groupKey(group), group._count._all]),
  );
  const sampleBy = new Map(
    input.samples.map((sample) => [groupKey(sample), sample.errorMessage]),
  );
  const errorGroups = input.groups.map((group) => ({
    purpose: group.purpose,
    failureKind: group.failureKind,
    count: group._count._all,
    previousCount: prevBy.get(groupKey(group)) ?? 0,
    lastAt: group._max.createdAt,
    sample: sampleBy.get(groupKey(group)) ?? null,
  }));

  const successRate = rate(ok, calls);
  const previousSuccessRate = comparableRate(input.prevOk, input.prevCalls);
  const portals = registeredOnly(input.runs, input.registeredPortals);
  const lastScrapeAt = portals.reduce<Date | null>(
    (latest, run) =>
      !latest || run.createdAt > latest ? run.createdAt : latest,
    null,
  );

  return {
    windowDays: days,
    since: input.since,
    previousSince: input.before,
    granularity: input.granularity,
    thresholds: OVERVIEW_THRESHOLDS,
    metrics: {
      aiCalls: { current: calls, previous: input.prevCalls },
      successRate: { current: successRate, previous: previousSuccessRate },
      tokens: {
        current: toUsageRow(input.tokens).totalTokens,
        previous: toUsageRow(input.prevTokens).totalTokens,
      },
      newJobs: {
        current: input.newJobs ?? 0,
        previous: input.prevNewJobs ?? 0,
      },
      queueWaiting: queue.totalWaiting,
      queueActive: queue.totalActive,
    },
    series: fillBuckets(input.buckets, days, now),
    errorGroups,
    queues: queue.queues.filter((row) => row.size + row.active > 0),
    queueCount: queue.queues.length,
    portals,
    attention: buildAttention({
      calls,
      ok,
      previousSuccessRate,
      failed: calls - ok,
      topFailure: topFailureKind(
        input.kinds.map((row) => ({
          kind: row.failureKind,
          count: row._count._all,
        })),
      ),
      queueWaiting: queue.totalWaiting,
      portals,
      lastScrapeAt,
      now,
    }),
  };
}
