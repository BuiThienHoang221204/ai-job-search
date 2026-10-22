import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScrapeRun } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import { QUEUE, QueueService } from '@/modules/queue/queue.service';
import { PromptBuilderService } from '@/modules/skills/services/prompt-builder.service';
import { JobSourceRouter } from './job-source.router';
import { fanOutSummary, planFanOut } from '../utils/fan-out';
import {
  MIN_COMPLETION_TO_SCORE,
  pairKey,
} from '@/modules/matching/rules/match-write';
import { QueryPlanner } from './query-planner.service';
import { JobWriter } from './job-writer.service';
import { collectCards } from '../utils/collect-cards';
import type { CollectLimits } from '../types';
import { requirementBatches } from '../utils/requirement-batches';
import type { SearchPlan } from '../planning/search-plan.schema';
import { messageOf } from '@/common/error-message';

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private readonly limits: CollectLimits;
  private readonly planner: QueryPlanner;
  private readonly writer: JobWriter;
  private readonly autoScore: boolean;

  constructor(
    private readonly prisma: PrismaService,
    ai: AiService,
    prompts: PromptBuilderService,
    private readonly portals: JobSourceRouter,
    private readonly queue: QueueService,
    config: ConfigService,
  ) {
    this.limits = {
      defaultLocation: config.get<string>('scraper.defaultLocation')!,
      maxJobsPerPortal: config.get<number>('scraper.maxJobsPerPortal')!,
      maxAgeDays: config.get<number>('scraper.maxAgeDays')!,
      maxPages: config.get<number>('scraper.maxPages')!,
      requirePostedAt: config.get<boolean>('scraper.requirePostedAt')!,
    };
    this.writer = new JobWriter(prisma, portals);
    this.planner = new QueryPlanner(
      prisma,
      ai,
      prompts,
      config.get<number>('scraper.systemQueryLimit')!,
    );
    this.autoScore = config.get<boolean>('scraper.autoScore')!;
  }

  async create(userId: string | null, portal: string): Promise<ScrapeRun> {
    if (!this.portals.has(portal)) {
      throw new NotFoundException(`Portal chưa được đăng ký: ${portal}`);
    }
    return this.prisma.scrapeRun.create({ data: { userId, portal } });
  }

  private async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.scrapeRun.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'FAILED', error, finishedAt: new Date() },
    });
  }

  async start(userId: string, portalKey?: string) {
    const available = this.portals.listPortals();
    const portal = portalKey ?? available[0];

    if (!portal) {
      throw new BadRequestException(
        'Chưa có portal nào được đăng ký. Kiểm tra thư mục .agents/skills/.',
      );
    }
    if (!this.portals.has(portal)) {
      throw new BadRequestException(
        `Portal chưa được hỗ trợ: ${portal}. Đang có: ${available.join(', ')}`,
      );
    }

    const run = await this.create(userId, portal);
    try {
      await this.queue.send(QUEUE.SCRAPE_RUN, {
        userId,
        runId: run.id,
      });
      return { queued: true, runId: run.id, portal: run.portal };
    } catch (queueError) {
      await this.markFailed(
        run.id,
        `Không thể đưa vào hàng đợi: ${messageOf(queueError)}`,
      );
      throw queueError;
    }
  }

  async run(runId: string): Promise<ScrapeRun> {
    const run = await this.prisma.scrapeRun.findUnique({
      where: { id: runId },
    });
    if (!run) throw new NotFoundException(`Không tìm thấy lần quét: ${runId}`);

    const claimed = await this.prisma.scrapeRun.updateMany({
      where: { id: runId, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: new Date(), error: null },
    });
    if (claimed.count === 0) {
      this.logger.warn(
        `Bỏ qua lần quét ${runId}: đang ở trạng thái ${run.status}, không còn PENDING`,
      );
      return run;
    }

    try {
      const portal = this.portals
        .describePortals()
        .find((p) => p.key === run.portal);
      const planned = await this.planFor(
        run,
        portal?.occupations ?? null,
        portal?.queryLimit ?? null,
      );
      if ('skip' in planned) {
        return await this.prisma.scrapeRun.update({
          where: { id: runId },
          data: {
            status: 'DONE',
            jobsFound: 0,
            jobsNew: 0,
            jobsQueued: 0,
            error: planned.skip,
            finishedAt: new Date(),
          },
        });
      }
      const { plan, modelId, clusterCodes } = planned;

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

      const { cards, askedIndices } = await collectCards(
        {
          search: (portal, args) => this.portals.search(portal, args),
          log: (message) => this.logger.log(message),
          limits: {
            ...this.limits,
            maxJobsPerPortal: portal?.maxJobs ?? this.limits.maxJobsPerPortal,
          },
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

      if (clusterCodes) {
        const crawled = askedIndices
          .map((index) => clusterCodes[index])
          .filter((code): code is string => code !== undefined);
        await this.planner.markCrawled(run.portal, crawled);
      }

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
      const message = messageOf(error);
      this.logger.error(`Quét thất bại (${runId}): ${message}`);
      return this.prisma.scrapeRun.update({
        where: { id: runId },
        data: { status: 'FAILED', error: message, finishedAt: new Date() },
      });
    }
  }

  private async planFor(
    run: ScrapeRun,
    occupations: string[] | null,
    queryLimit: number | null,
  ): Promise<
    | { skip: string }
    | {
        plan: SearchPlan;
        modelId: string | null;
        clusterCodes: string[] | null;
      }
  > {
    if (!run.userId) {
      const system = await this.planner.forSystem(
        run.portal,
        occupations,
        queryLimit,
      );
      return {
        plan: system.plan,
        modelId: null,
        clusterCodes: system.clusterCodes,
      };
    }

    const profile = await this.prisma.profile.findUnique({
      where: { userId: run.userId },
    });
    if (
      occupations &&
      profile?.occupationCode &&
      !occupations.includes(profile.occupationCode)
    ) {
      return {
        skip: `${run.portal} chỉ phục vụ ngành ${occupations.join(', ')}; hồ sơ thuộc ngành khác nên không có tin nào phù hợp.`,
      };
    }

    const { plan, modelId } = await this.planner.forUser(profile, run.userId);
    return { plan, modelId, clusterCodes: null };
  }

  private async extractRequirements(jobIds: string[]): Promise<number> {
    if (!jobIds.length) return 0;

    await this.queue.sendMany(
      QUEUE.EXTRACT_REQUIREMENTS,
      requirementBatches(jobIds),
    );
    return jobIds.length;
  }

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

    this.logger.log(fanOutSummary(plan, queued, served.length, users.length));
    return queued;
  }
}
