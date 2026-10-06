import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  OccupationCoverageQueryDto,
  ScrapeBatchesQueryDto,
  TimeRangeQueryDto,
} from '../admin.dto';
import { pageFromArray } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import { JobSourceRouter } from '@/modules/scraper/services/job-source.router';
import {
  groupBatches,
  portalStats,
  type RunLite,
} from '../utils/scrape-batches';
import { occupationCoverage } from '../utils/occupation-coverage';
import { daysAgo } from '@/common/duration';
import { dateRange, registeredOnly } from '../utils/filters';

const DEFAULT_STALE_DAYS = 7;

const MAX_RUNS = 2_000;

@Injectable()
export class AdminScrapeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: JobSourceRouter,
    private readonly config: ConfigService,
  ) {}

  async portals(query: TimeRangeQueryDto) {
    const runs = await this.recentRuns(query);
    const cap = this.cap();
    const items = this.sources.describePortals().map((entry) => ({
      ...entry,
      ...portalStats(entry.key, runs, cap),
    }));
    return { cap, ...pageFromArray(items, query) };
  }

  async batches(query: ScrapeBatchesQueryDto) {
    const runs = registeredOnly(
      await this.recentRuns(query),
      this.sources.listPortals(),
    );
    const batches = groupBatches(runs);
    const items = query.failedOnly
      ? batches.filter((batch) => batch.failed > 0)
      : batches;
    return pageFromArray(items, query);
  }

  async occupationCoverage(query: OccupationCoverageQueryDto) {
    const staleDays = query.staleDays ?? DEFAULT_STALE_DAYS;
    const cutoff = daysAgo(staleDays);

    const [jobRows, crawlRows] = await Promise.all([
      this.prisma.job.groupBy({
        by: ['occupationCode'],
        _count: { _all: true },
      }),
      this.prisma.occupationCrawl.findMany({
        where: { lastCrawledAt: { gte: cutoff } },
        select: { occupationCode: true },
        distinct: ['occupationCode'],
      }),
    ]);

    const jobCounts = new Map(
      jobRows
        .filter(
          (row): row is typeof row & { occupationCode: string } =>
            row.occupationCode !== null,
        )
        .map((row) => [row.occupationCode, row._count._all]),
    );
    const crawledCodes = new Set(crawlRows.map((row) => row.occupationCode));

    return { staleDays, items: occupationCoverage(jobCounts, crawledCodes) };
  }

  private cap(): number {
    return this.config.get<number>('scraper.maxJobsPerPortal') ?? 50;
  }

  private async recentRuns(range: TimeRangeQueryDto): Promise<RunLite[]> {
    const rows = await this.prisma.scrapeRun.findMany({
      where: { createdAt: dateRange(range) },
      orderBy: { createdAt: 'desc' },
      take: MAX_RUNS,
      select: {
        id: true,
        portal: true,
        status: true,
        userId: true,
        jobsFound: true,
        jobsNew: true,
        error: true,
        createdAt: true,
        finishedAt: true,
        user: { select: { email: true } },
      },
    });
    return rows.map(({ user, ...run }) => ({
      ...run,
      userEmail: user?.email ?? null,
    }));
  }
}
