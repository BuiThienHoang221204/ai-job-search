import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScrapeBatchesQueryDto, TimeRangeQueryDto } from '../admin.dto';
import { pageFromArray } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import { JobSourceRouter } from '@/modules/scraper/services/job-source.router';
import {
  groupBatches,
  portalStats,
  type RunLite,
} from '../utils/scrape-batches';
import { dateRange, registeredOnly } from '../utils/filters';

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
