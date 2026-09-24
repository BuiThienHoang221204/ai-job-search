import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../../common/pagination.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { FailureFacetsQueryDto, FailuresQueryDto } from '../admin.dto.js';
import { buildAiHealth, type AiHealth } from '../utils/ai-health.js';
import {
  byTokensDesc,
  fillBuckets,
  granularityFor,
  PG_BUCKET_FORMAT,
  toUsageRow,
  windowStart,
  withFailed,
  type BucketRow,
  type Granularity,
} from '../utils/ai-usage.js';
import {
  buildAttention,
  failureWindow,
  comparableRate,
  OVERVIEW_THRESHOLDS,
  previousSince,
  rate,
  topFailureKind,
} from '../utils/overview.js';
import { QueueService } from '../../queue/queue.service.js';
import { JobSourceRouter } from '../../scraper/services/job-source.router.js';
import { visibleResponse } from '../utils/response-redaction.js';

/** Số nhóm lỗi hiện trên trang tổng quan. */
const ERROR_GROUPS = 8;

/** Số người dùng tốn token nhất hiện trên bảng xếp hạng. */
const TOP_USERS = 10;

const TOKEN_SUMS = {
  _count: { _all: true },
  _sum: { inputTokens: true, outputTokens: true, cachedTokens: true },
} as const;

/**
 * Trần số bản ghi đọc lên để tính phân vị. Đủ rộng để có ý nghĩa thống kê,
 * đủ hẹp để không kéo cả bảng lên bộ nhớ khi nhật ký lớn dần.
 */
const MAX_ROWS = 5_000;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly sources: JobSourceRouter,
  ) {}

  async aiHealth(days: number): Promise<AiHealth & { windowDays: number }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.aiCall.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      select: {
        purpose: true,
        modelId: true,
        ok: true,
        failureKind: true,
        durationMs: true,
      },
    });

    return { ...buildAiHealth(rows), windowDays: days };
  }

  /**
   * Các lần hỏng gần nhất, kèm thông báo thật. Bảng tổng hợp cho biết CÓ vấn
   * đề; danh sách này cho biết vấn đề là gì.
   */
  async recentFailures(query: FailuresQueryDto) {
    const where: Prisma.AiCallWhereInput = {
      ...failureWindow(query),
      // Giao diện hiện `failureKind = null` là OTHER, nên lọc OTHER cũng phải lấy cả null.
      ...(query.failureKind === 'OTHER'
        ? { OR: [{ failureKind: 'OTHER' }, { failureKind: null }] }
        : query.failureKind
          ? { failureKind: query.failureKind }
          : {}),
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(query.model
        ? {
            AND: [
              {
                OR: [
                  { modelId: { contains: query.model, mode: 'insensitive' } },
                  { provider: { contains: query.model, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.aiCall.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        select: {
          id: true,
          purpose: true,
          provider: true,
          modelId: true,
          failureKind: true,
          errorMessage: true,
          durationMs: true,
          createdAt: true,
        },
      }),
      this.prisma.aiCall.count({ where }),
    ]);

    return pageOf(items, total, query);
  }

  /** Các lựa chọn cho bộ lọc nhật ký lỗi kèm số lần hỏng, trong cùng khoảng thời gian. */
  async failureFacets(range: FailureFacetsQueryDto) {
    const where = failureWindow(range);
    const [purposes, models] = await Promise.all([
      this.prisma.aiCall.groupBy({
        by: ['purpose'],
        where,
        _count: { _all: true },
        orderBy: { _count: { purpose: 'desc' } },
      }),
      this.prisma.aiCall.groupBy({
        by: ['provider', 'modelId'],
        where,
        _count: { _all: true },
        orderBy: { _count: { modelId: 'desc' } },
      }),
    ]);
    return {
      purposes: purposes.map((row) => ({
        purpose: row.purpose,
        count: row._count._all,
      })),
      models: models.map((row) => ({
        provider: row.provider,
        modelId: row.modelId,
        count: row._count._all,
      })),
    };
  }

  /** Một lời gọi đầy đủ; `responseText` bị che nếu gắn với người dùng hoặc tác vụ mang dữ liệu cá nhân. */
  async aiCall(id: string) {
    const call = await this.prisma.aiCall.findUnique({
      where: { id },
      select: {
        id: true,
        purpose: true,
        provider: true,
        modelId: true,
        ok: true,
        failureKind: true,
        errorMessage: true,
        finishReason: true,
        durationMs: true,
        inputTokens: true,
        outputTokens: true,
        cachedTokens: true,
        responseText: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });
    if (!call) throw new NotFoundException(`Không tìm thấy lời gọi AI: ${id}`);

    const { responseText, ...rest } = call;
    return {
      ...rest,
      ...visibleResponse(
        { purpose: call.purpose, userId: call.user?.id ?? null },
        responseText,
      ),
    };
  }

  /** Token cộng dồn trong `days` ngày (1 = 24 giờ, chia theo giờ); lời gọi không báo token thì chỉ được đếm số lần. */
  async aiUsage(days: number) {
    const granularity = granularityFor(days);
    const since = windowStart(days);
    const where = { createdAt: { gte: since } };
    const failedWhere = { ...where, ok: false };

    const [
      totals,
      failedTotal,
      untracked,
      models,
      failedModels,
      purposes,
      failedPurposes,
      users,
      bucketRows,
    ] = await Promise.all([
      this.prisma.aiCall.aggregate({ where, ...TOKEN_SUMS }),
      this.prisma.aiCall.count({ where: failedWhere }),
      this.prisma.aiCall.count({ where: { ...where, inputTokens: null } }),
      this.prisma.aiCall.groupBy({ by: ['modelId'], where, ...TOKEN_SUMS }),
      this.prisma.aiCall.groupBy({
        by: ['modelId'],
        where: failedWhere,
        _count: { _all: true },
      }),
      this.prisma.aiCall.groupBy({ by: ['purpose'], where, ...TOKEN_SUMS }),
      this.prisma.aiCall.groupBy({
        by: ['purpose'],
        where: failedWhere,
        _count: { _all: true },
      }),
      this.prisma.aiCall.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
        ...TOKEN_SUMS,
      }),
      this.usageBuckets(granularity, since),
    ]);

    const topUsers = byTokensDesc(
      users.map((row) => ({
        userId: row.userId as string,
        ...toUsageRow(row),
      })),
    ).slice(0, TOP_USERS);
    const people = await this.prisma.user.findMany({
      where: { id: { in: topUsers.map((row) => row.userId) } },
      select: { id: true, email: true, name: true },
    });
    const personBy = new Map(people.map((person) => [person.id, person]));

    return {
      windowDays: days,
      since,
      granularity,
      totals: { ...toUsageRow(totals, failedTotal), untrackedCalls: untracked },
      buckets: fillBuckets(bucketRows, days),
      byModel: byTokensDesc(withFailed('modelId', models, failedModels)),
      byPurpose: byTokensDesc(withFailed('purpose', purposes, failedPurposes)),
      topUsers: topUsers.map((row) => ({
        ...row,
        email: personBy.get(row.userId)?.email ?? null,
        name: personBy.get(row.userId)?.name ?? null,
      })),
    };
  }

  /** Trả lời "có gì đang hỏng không": số kỳ này so kỳ trước, lỗi gom nhóm, lượt quét mới nhất mỗi portal và mục cần xử lý. */
  async overview(days: number) {
    const now = new Date();
    const granularity = granularityFor(days);
    const since = windowStart(days, now);
    const before = previousSince(since, now);
    const current = { createdAt: { gte: since } };
    const previous = { createdAt: { gte: before, lt: since } };

    const [
      calls,
      ok,
      prevCalls,
      prevOk,
      tokens,
      prevTokens,
      newJobs,
      prevNewJobs,
      groups,
      prevGroups,
      kinds,
      buckets,
      runs,
      queue,
    ] = await Promise.all([
      this.prisma.aiCall.count({ where: current }),
      this.prisma.aiCall.count({ where: { ...current, ok: true } }),
      this.prisma.aiCall.count({ where: previous }),
      this.prisma.aiCall.count({ where: { ...previous, ok: true } }),
      this.prisma.aiCall.aggregate({ where: current, ...TOKEN_SUMS }),
      this.prisma.aiCall.aggregate({ where: previous, ...TOKEN_SUMS }),
      this.prisma.scrapeRun.aggregate({
        where: current,
        _sum: { jobsNew: true },
      }),
      this.prisma.scrapeRun.aggregate({
        where: previous,
        _sum: { jobsNew: true },
      }),
      this.prisma.aiCall.groupBy({
        by: ['purpose', 'failureKind'],
        where: { ...current, ok: false },
        _count: { _all: true },
        _max: { createdAt: true },
        orderBy: { _count: { purpose: 'desc' } },
        take: ERROR_GROUPS,
      }),
      this.prisma.aiCall.groupBy({
        by: ['purpose', 'failureKind'],
        where: { ...previous, ok: false },
        _count: { _all: true },
      }),
      this.prisma.aiCall.groupBy({
        by: ['failureKind'],
        where: { ...current, ok: false },
        _count: { _all: true },
      }),
      this.usageBuckets(granularity, since),
      this.prisma.scrapeRun.findMany({
        distinct: ['portal'],
        orderBy: { createdAt: 'desc' },
        select: {
          portal: true,
          status: true,
          jobsNew: true,
          error: true,
          createdAt: true,
        },
      }),
      this.queue.getStats(),
    ]);

    // Câu lỗi mới nhất của mỗi nhóm, để admin nhận ra lỗi mà không phải mở nhật ký.
    const samples = await Promise.all(
      groups.map((group) =>
        this.prisma.aiCall.findFirst({
          where: {
            ...current,
            ok: false,
            purpose: group.purpose,
            failureKind: group.failureKind,
          },
          orderBy: { createdAt: 'desc' },
          select: { errorMessage: true },
        }),
      ),
    );

    const prevBy = new Map(
      prevGroups.map((g) => [`${g.purpose}|${g.failureKind}`, g._count._all]),
    );
    const errorGroups = groups.map((group, index) => ({
      purpose: group.purpose,
      failureKind: group.failureKind,
      count: group._count._all,
      previousCount: prevBy.get(`${group.purpose}|${group.failureKind}`) ?? 0,
      lastAt: group._max.createdAt,
      sample: samples[index]?.errorMessage ?? null,
    }));

    const successRate = rate(ok, calls);
    const previousSuccessRate = comparableRate(prevOk, prevCalls);
    // Portal đã gỡ khỏi registry vẫn còn lượt hỏng cũ; báo về chúng là báo động giả vĩnh viễn.
    const registered = new Set(this.sources.listPortals());
    const portals = runs.filter((run) => registered.has(run.portal));
    const lastScrapeAt = portals.reduce<Date | null>(
      (latest, run) =>
        !latest || run.createdAt > latest ? run.createdAt : latest,
      null,
    );
    const failed = calls - ok;

    return {
      windowDays: days,
      since,
      previousSince: before,
      granularity,
      thresholds: OVERVIEW_THRESHOLDS,
      metrics: {
        aiCalls: { current: calls, previous: prevCalls },
        successRate: { current: successRate, previous: previousSuccessRate },
        tokens: {
          current: toUsageRow(tokens).totalTokens,
          previous: toUsageRow(prevTokens).totalTokens,
        },
        newJobs: {
          current: newJobs._sum.jobsNew ?? 0,
          previous: prevNewJobs._sum.jobsNew ?? 0,
        },
        queueWaiting: queue.totalWaiting,
        queueActive: queue.totalActive,
      },
      series: fillBuckets(buckets, days, now),
      errorGroups,
      queues: queue.queues.filter((row) => row.size + row.active > 0),
      queueCount: queue.queues.length,
      portals,
      attention: buildAttention({
        calls,
        ok,
        previousSuccessRate,
        failed,
        topFailure: topFailureKind(
          kinds.map((row) => ({
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

  /** Số lời gọi, lần hỏng và token theo từng ô giờ hoặc ngày (giờ Việt Nam). */
  private usageBuckets(granularity: Granularity, since: Date) {
    return this.prisma.$queryRaw<BucketRow[]>`
      select to_char(("createdAt" at time zone 'UTC') at time zone 'Asia/Ho_Chi_Minh', ${PG_BUCKET_FORMAT[granularity]}) as bucket,
             count(*)::int as calls,
             (count(*) filter (where not ok))::int as failed,
             coalesce(sum("inputTokens"), 0)::int as "inputTokens",
             coalesce(sum("outputTokens"), 0)::int as "outputTokens"
      from ai_calls
      where "createdAt" >= ${since}
      group by 1
      order by 1`;
  }

  /** Lượt quét của mọi tài khoản, kèm email chủ lượt; lượt hệ thống có `user = null`. */
  async scrapeRuns(query: PaginationQueryDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.scrapeRun.findMany({
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        include: { user: { select: { id: true, email: true } } },
      }),
      this.prisma.scrapeRun.count(),
    ]);
    return pageOf(items, total, query);
  }
}
