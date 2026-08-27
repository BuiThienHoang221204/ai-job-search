import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScrapeRun } from '../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/services/ai.service.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { PromptBuilderService } from '../skills/services/prompt-builder.service.js';
import { JobSourceRouter } from './sources/job-source.router.js';
import { MIN_COMPLETION_TO_SCORE, pairKey, planFanOut } from './fan-out.js';
import { QueryPlanner } from './planning/query-planner.js';
import { JobWriter } from './ingest/job-writer.js';
import { collectCards, type CollectLimits } from './ingest/collect-cards.js';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private readonly limits: CollectLimits;
  private readonly planner: QueryPlanner;
  private readonly writer: JobWriter;
  private readonly autoScore: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptBuilderService,
    private readonly portals: JobSourceRouter,
    private readonly queue: QueueService,
    config: ConfigService,
  ) {
    this.limits = {
      defaultLocation:
        config.get<string>('scraper.defaultLocation') ?? 'Vietnam',
      maxJobsPerPortal: config.get<number>('scraper.maxJobsPerPortal') ?? 50,
      maxAgeDays: config.get<number>('scraper.maxAgeDays') ?? 7,
      maxPages: config.get<number>('scraper.maxPages') ?? 5,
      requirePostedAt: config.get<boolean>('scraper.requirePostedAt') ?? false,
    };
    this.writer = new JobWriter(prisma, portals);
    this.planner = new QueryPlanner(
      prisma,
      ai,
      prompts,
      config.get<number>('scraper.systemQueryLimit') ?? 10,
    );
    this.autoScore = config.get<boolean>('scraper.autoScore') ?? false;
  }

  /**
   * `userId = null` tạo một lần quét của HỆ THỐNG (cron chạy). Xem ghi chú
   * trên model ScrapeRun để biết vì sao quét chung thay vì quét theo từng
   * người.
   */
  async create(userId: string | null, portal: string): Promise<ScrapeRun> {
    if (!this.portals.has(portal)) {
      throw new NotFoundException(`Portal chưa được đăng ký: ${portal}`);
    }
    return this.prisma.scrapeRun.create({ data: { userId, portal } });
  }

  async run(runId: string): Promise<ScrapeRun> {
    const run = await this.prisma.scrapeRun.findUnique({
      where: { id: runId },
    });
    if (!run) throw new NotFoundException(`Không tìm thấy lần quét: ${runId}`);

    await this.prisma.scrapeRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date(), error: null },
    });

    try {
      const userId = run.userId;
      const system = userId ? null : await this.planner.forSystem(run.portal);
      const { plan, modelId } = system
        ? { plan: system.plan, modelId: null }
        : await this.planner.forUser(
            await this.prisma.profile.findUnique({
              where: { userId: userId! },
            }),
            userId!,
          );

      if (!plan.queries.length) {
        throw new Error(
          run.userId
            ? 'Hồ sơ chưa có chức danh hay kỹ năng nào để tìm việc. Hãy điền hồ sơ rồi quét lại.'
            : 'Chưa có hồ sơ nào đủ dữ liệu để quét chung.',
        );
      }

      await this.prisma.scrapeRun.update({
        where: { id: runId },
        data: { queries: plan.queries, modelId },
      });

      const cards = await collectCards(
        {
          search: (portal, args) => this.portals.search(portal, args),
          log: (message) => this.logger.log(message),
          limits: this.limits,
        },
        run.portal,
        plan.queries,
      );

      const saved = await this.writer.save(run.portal, cards);

      const extracted = await this.extractRequirements(saved.savedJobIds);
      if (extracted) {
        this.logger.log(`Xếp hàng rút yêu cầu cho ${extracted} tin`);
      }

      const queued = this.autoScore
        ? await this.fanOut(run.userId, saved.savedJobIds)
        : 0;

      if (system)
        await this.planner.markCrawled(run.portal, system.occupations);

      return await this.prisma.scrapeRun.update({
        where: { id: runId },
        data: {
          status: 'DONE',
          jobsFound: saved.found,
          jobsNew: saved.fresh,
          jobsQueued: queued,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Quét thất bại (${runId}): ${message}`);
      return this.prisma.scrapeRun.update({
        where: { id: runId },
        data: { status: 'FAILED', error: message, finishedAt: new Date() },
      });
    }
  }

  /**
   * Xếp hàng rút yêu cầu cho các tin vừa lưu. MỘT lượt cho mỗi tin, dùng chung
   * cho mọi hồ sơ — đây là thứ giữ chi phí ở mức O(số tin).
   */
  private async extractRequirements(jobIds: string[]): Promise<number> {
    if (!jobIds.length) return 0;
    return this.queue.sendMany(
      QUEUE.EXTRACT_REQUIREMENTS,
      jobIds.map((jobId) => ({ jobId })),
    );
  }

  /** Xếp hàng chấm điểm cho các tin vừa lưu. */
  private async fanOut(
    userId: string | null,
    jobIds: string[],
  ): Promise<number> {
    if (!jobIds.length) return 0;

    if (userId) {
      return this.queue.sendMany(
        QUEUE.EVALUATE_MATCH,
        jobIds.map((jobId) => ({ userId, jobId })),
      );
    }

    const [users, scored, jobs] = await Promise.all([
      this.prisma.profile.findMany({
        where: { completion: { gte: MIN_COMPLETION_TO_SCORE } },
        orderBy: [
          { lastFanOutAt: { sort: 'asc', nulls: 'first' } },
          { userId: 'asc' },
        ],
        select: {
          userId: true,
          completion: true,
          primarySkills: true,
          secondarySkills: true,
        },
      }),
      this.prisma.jobMatch.findMany({
        where: { jobId: { in: jobIds } },
        select: { userId: true, jobId: true },
      }),
      this.prisma.job.findMany({
        where: { id: { in: jobIds } },
        select: { id: true, title: true, description: true },
      }),
    ]);

    const plan = planFanOut({
      jobs: jobs.map((job) => ({
        id: job.id,
        text: `${job.title} ${job.description}`,
      })),
      users: users.map((row) => ({
        id: row.userId,
        completion: row.completion,
        skills: [...row.primarySkills, ...row.secondarySkills],
      })),
      alreadyScored: scored.map((row) => pairKey(row.userId, row.jobId)),
    });

    const queued = await this.queue.sendMany(
      QUEUE.EVALUATE_MATCH,
      plan.targets,
    );

    const served = [...new Set(plan.targets.map((target) => target.userId))];
    if (served.length) {
      await this.prisma.profile.updateMany({
        where: { userId: { in: served } },
        data: { lastFanOutAt: new Date() },
      });
    }

    this.logger.log(
      `Xếp hàng ${queued}/${plan.targets.length} lượt chấm cho ${served.length}/${users.length} hồ sơ` +
        (plan.dropped ? `; BỎ ${plan.dropped} lượt ngoài hạn ngạch` : '') +
        (plan.skippedThinProfiles
          ? `; bỏ qua ${plan.skippedThinProfiles} hồ sơ quá sơ sài`
          : '') +
        (plan.skippedNoOverlap
          ? `; bỏ ${plan.skippedNoOverlap} cặp không khớp kỹ năng nào`
          : ''),
    );
    return queued;
  }

  /**
   * Kèm cả lần quét của hệ thống: chính chúng mới là nguồn tin cho người dùng,
   * nên giấu đi thì lịch sử trông như không có gì xảy ra.
   */
  async history(userId: string, query: PaginationQueryDto) {
    const where = { OR: [{ userId }, { userId: null }] };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.scrapeRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.scrapeRun.count({ where }),
    ]);

    return pageOf(items, total, query);
  }

  async get(userId: string, id: string) {
    const run = await this.prisma.scrapeRun.findFirst({
      where: { id, OR: [{ userId }, { userId: null }] },
    });
    if (!run) throw new NotFoundException(`Không tìm thấy lần quét: ${id}`);
    return run;
  }
}
