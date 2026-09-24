import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScrapeBatchesQueryDto, TimeRangeQueryDto } from '../admin.dto.js';
import { pageFromArray } from '../../../common/pagination.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { JobSourceRouter } from '../../scraper/services/job-source.router.js';
import {
  groupBatches,
  portalStats,
  type RunLite,
} from '../utils/scrape-batches.js';

/** Trần số lượt đọc lên để gom; ~4 lượt mỗi đêm nên đủ cho hơn một năm. */
const MAX_RUNS = 2_000;

@Injectable()
export class AdminScrapeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: JobSourceRouter,
    private readonly config: ConfigService,
  ) {}

  /** Tình trạng từng portal trong khoảng thời gian đã chọn, kèm cấu hình đọc từ SKILL.md. */
  async portals(query: TimeRangeQueryDto) {
    const runs = await this.recentRuns(query);
    const cap = this.cap();
    const items = this.sources.describePortals().map((entry) => ({
      ...entry,
      ...portalStats(entry.key, runs, cap),
    }));
    return { cap, ...pageFromArray(items, query) };
  }

  /** Lịch sử theo lượt đêm, mỗi lượt gồm kết quả của từng portal. */
  async batches(query: ScrapeBatchesQueryDto) {
    // Portal đã gỡ khỏi registry không còn cột trên giao diện; giữ lượt của chúng thì bộ lọc "hỏng" bắt nhầm.
    const registered = new Set(this.sources.listPortals());
    const runs = (await this.recentRuns(query)).filter((run) =>
      registered.has(run.portal),
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
      where: {
        createdAt: {
          ...(range.from ? { gte: new Date(range.from) } : {}),
          ...(range.to ? { lt: new Date(range.to) } : {}),
        },
      },
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
