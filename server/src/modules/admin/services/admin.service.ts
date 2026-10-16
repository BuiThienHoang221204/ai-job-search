import { Injectable, NotFoundException } from '@nestjs/common';
import { pageArgs, pageOf } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import type { FailureFacetsQueryDto, FailuresQueryDto } from '../admin.dto';
import { buildAiHealth, type AiHealth } from '../utils/ai-health';
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
} from '../utils/ai-usage';
import {
  buildOverview,
  previousSince,
  type ErrorSampleRow,
} from '../utils/overview';
import { failureWindow, failuresWhere } from '../utils/filters';
import { QueueService } from '@/modules/queue/queue.service';
import { JobSourceRouter } from '@/modules/scraper/services/job-source.router';
import { visibleResponse } from '../utils/response-redaction';
import { daysAgo } from '@/common/duration';

const ERROR_GROUPS = 8;

const TOP_USERS = 10;

const TOKEN_SUMS = {
  _count: { _all: true },
  _sum: { inputTokens: true, outputTokens: true, cachedTokens: true },
} as const;

const MAX_ROWS = 5_000;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly sources: JobSourceRouter,
  ) {}

  async aiHealth(days: number): Promise<AiHealth & { windowDays: number }> {
    const since = daysAgo(days);

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

  async recentFailures(query: FailuresQueryDto) {
    const where = failuresWhere(query);

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

  async overview(days: number) {
    const now = new Date();
    const granularity = granularityFor(days);
    const since = windowStart(days, now);
    const before = previousSince(since, now);
    const current = { createdAt: { gte: since } };
    const previous = { createdAt: { gte: before, lt: since } };

    const [
      ok,
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
      this.prisma.aiCall.count({ where: { ...current, ok: true } }),
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

    const samples = await this.latestErrorSamples(
      since,
      groups.map((group) => group.purpose),
    );

    return buildOverview({
      days,
      now,
      since,
      before,
      granularity,
      calls: tokens._count._all,
      ok,
      prevCalls: prevTokens._count._all,
      prevOk,
      tokens,
      prevTokens,
      newJobs: newJobs._sum.jobsNew,
      prevNewJobs: prevNewJobs._sum.jobsNew,
      groups,
      prevGroups,
      samples,
      kinds,
      buckets,
      runs,
      registeredPortals: this.sources.listPortals(),
      queue,
    });
  }

  private latestErrorSamples(
    since: Date,
    purposes: string[],
  ): Promise<ErrorSampleRow[]> {
    if (!purposes.length) return Promise.resolve([]);
    return this.prisma.$queryRaw<ErrorSampleRow[]>`
      select distinct on (purpose, "failureKind") purpose, "failureKind"::text as "failureKind", "errorMessage"
      from ai_calls
      where "createdAt" >= ${since} and not ok and purpose = any(${purposes})
      order by purpose, "failureKind", "createdAt" desc`;
  }

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
}
