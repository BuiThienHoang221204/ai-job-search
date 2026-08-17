import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Profile, ScrapeRun } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { PromptBuilderService } from '../skills/prompt-builder.service.js';
import { JobSourceRouter } from './job-source.router.js';
import { type PortalJobCard } from './portal-cli.service.js';
import { MIN_COMPLETION_TO_SCORE, pairKey, planFanOut } from './fan-out.js';
import { parsePostedAt } from './normalize.js';
import { planForSystem, planFromProfile } from './query-plan.js';
import { searchPlanSchema, type SearchPlan } from './scraper.schema.js';

/**
 * Số truy vấn tối đa cho một lần quét của hệ thống. Mỗi truy vấn là một
 * request tới portal, nên đây trực tiếp là tải đặt lên họ.
 */
const SYSTEM_QUERY_LIMIT = 6;

/**
 * Trần số tin lấy về một lần quét. Mỗi tin là một request `detail` nữa, và
 * sau đó là một lần gọi model để chấm điểm - nên con số này trực tiếp quyết
 * định tải lên cả ITviec lẫn gateway AI.
 */
const MAX_JOBS_PER_RUN = 12;

/**
 * Nghỉ giữa các request tới portal. robots.txt cho phép, nhưng không có
 * nghĩa là nên bắn liên tục.
 */
const POLITE_DELAY_MS = 1_200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private readonly defaultLocation: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptBuilderService,
    private readonly portals: JobSourceRouter,
    private readonly queue: QueueService,
    config: ConfigService,
  ) {
    this.defaultLocation =
      config.get<string>('scraper.defaultLocation') ?? 'Vietnam';
  }

  /** Sinh truy vấn trực tiếp từ hồ sơ, không gọi AI. */
  private deterministicQueries(profile: Profile | null): SearchPlan {
    return { queries: planFromProfile(profile) };
  }

  /** Tinh chỉnh truy vấn bằng AI. Tùy chọn: hỏng thì dùng bản tất định. */
  private async refineQueries(
    profile: Profile | null,
    userId: string,
  ): Promise<{
    plan: SearchPlan;
    modelId: string;
  }> {
    const system = [
      'Bạn sinh từ khóa tìm việc cho một ứng viên tại Việt Nam. Ứng viên có thể thuộc BẤT KỲ ngành nghề nào - hãy đọc hồ sơ để biết, đừng giả định.',
      '',
      'Quy tắc bắt buộc:',
      '- Từ khóa phải NGẮN, 1-4 từ. KHÔNG đặt câu.',
      '- NGÔN NGỮ theo ngành: chức danh ngành CNTT và kỹ thuật thì dùng TIẾNG ANH ("frontend developer", "devops engineer") vì tin tuyển dụng nhóm này ở Việt Nam đăng bằng tiếng Anh. MỌI ngành còn lại dùng TIẾNG VIỆT CÓ DẤU ("kế toán tổng hợp", "nhân viên kinh doanh", "chuyên viên tuyển dụng") vì tin của họ đăng bằng tiếng Việt. Chọn sai ngôn ngữ thì không tìm được tin nào.',
      '- Chỉ dùng kỹ năng và chức danh CÓ THẬT trong hồ sơ. Không sinh từ khóa cho việc ứng viên chưa từng làm.',
      '- Địa điểm phải khớp ràng buộc đi lại của ứng viên. Ứng viên không chấp nhận chuyển nơi ở thì chỉ tìm tại thành phố họ đang sống.',
      '- Truy vấn đầu tiên là CHỨC DANH hiện tại của ứng viên. Chức danh là thứ nhà tuyển dụng dùng để đặt tên tin, nên nó tìm đúng hơn kỹ năng ở mọi ngành.',
      '- Các truy vấn sau ghép chức danh với lĩnh vực mục tiêu, rồi mới tới kỹ năng chính. Không được lạc sang nghề khác.',
    ].join('\n');

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
    ].join('\n');

    const { object, modelId } = await this.ai.generateObject<SearchPlan>({
      schema: searchPlanSchema,
      context: { purpose: 'scrape.plan', userId },
      system,
      prompt,
      timeoutMs: 30_000,
      maxRetries: 0,
    });
    return { plan: object, modelId };
  }

  private async planQueries(
    profile: Profile | null,
    userId: string,
  ): Promise<{
    plan: SearchPlan;
    modelId: string | null;
  }> {
    const baseline = this.deterministicQueries(profile);
    if (!baseline.queries.length) {
      return { plan: baseline, modelId: null };
    }

    try {
      const refined = await this.refineQueries(profile, userId);
      this.logger.log(`Truy vấn do ${refined.modelId} tinh chỉnh`);
      return refined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Tinh chỉnh truy vấn thất bại (${message}); dùng bản tất định`,
      );
      return { plan: baseline, modelId: null };
    }
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

  /**
   * Từ khoá cho lần quét của hệ thống: gộp chức danh và kỹ năng của mọi hồ sơ
   * đang hoạt động.
   */
  private async systemQueries(): Promise<SearchPlan> {
    const profiles = await this.prisma.profile.findMany({
      where: { completion: { gte: MIN_COMPLETION_TO_SCORE } },
      select: { headline: true, primarySkills: true },
    });

    return { queries: planForSystem(profiles, SYSTEM_QUERY_LIMIT) };
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
      const { plan, modelId } = run.userId
        ? await this.planQueries(
            await this.prisma.profile.findUnique({
              where: { userId: run.userId },
            }),
            run.userId,
          )
        : { plan: await this.systemQueries(), modelId: null };

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

      const seen = new Map<string, PortalJobCard>();
      for (const query of plan.queries) {
        if (seen.size >= MAX_JOBS_PER_RUN) break;

        const cards = await this.portals.search(run.portal, {
          query: query.query,
          location: query.location || this.defaultLocation,
          limit: MAX_JOBS_PER_RUN,
        });
        for (const card of cards)
          if (!seen.has(card.id)) seen.set(card.id, card);

        this.logger.log(
          `${run.portal} "${query.query}" -> ${cards.length} tin, tích lũy ${seen.size}`,
        );
        await sleep(POLITE_DELAY_MS);
      }

      const cards = [...seen.values()].slice(0, MAX_JOBS_PER_RUN);

      const existing = await this.prisma.job.findMany({
        where: {
          source: run.portal,
          externalId: { in: cards.map((card) => card.id) },
        },
        select: { externalId: true },
      });
      const known = new Set(existing.map((job) => job.externalId));
      const fresh = cards.filter((card) => !known.has(card.id));

      this.logger.log(
        `${cards.length} tin tìm được, ${fresh.length} tin mới, ${known.size} đã có`,
      );

      const refreshed = await this.refreshKnownCards(
        run.portal,
        cards.filter((card) => known.has(card.id)),
      );
      if (refreshed) {
        this.logger.log(`Làm mới dữ liệu thẻ cho ${refreshed} tin đã có`);
      }

      const savedJobIds: string[] = [];
      let skipped = 0;

      for (const card of fresh) {
        try {
          let description = card.description ?? null;
          if (!description) {
            const detail = await this.portals.detail(run.portal, card.slug);
            description = detail.description;
            await sleep(POLITE_DELAY_MS);
          }

          if (!description || description.length < 80) {
            this.logger.warn(`Bỏ qua ${card.slug}: mô tả quá ngắn hoặc trống`);
            skipped += 1;
            continue;
          }

          const postedAt = parsePostedAt(card.postedAt);

          const job = await this.prisma.job.upsert({
            where: {
              source_externalId: { source: run.portal, externalId: card.id },
            },
            create: {
              source: run.portal,
              externalId: card.id,
              url: card.url,
              title: card.title,
              company: card.company ?? 'Không rõ',
              companyLogo: card.companyLogo,
              location: card.location,
              workMode: card.workMode,
              salaryRaw: card.salary,
              tags: card.tags,
              description,
              postedAt,
            },
            update: {
              description,
              salaryRaw: card.salary,
              ...(postedAt ? { postedAt } : {}),
              ...(card.companyLogo ? { companyLogo: card.companyLogo } : {}),
            },
          });
          savedJobIds.push(job.id);
        } catch (error) {
          skipped += 1;
          this.logger.warn(
            `Bỏ qua ${card.slug}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (skipped) {
        this.logger.log(
          `Đã bỏ qua ${skipped}/${fresh.length} tin mới; lưu được ${savedJobIds.length}`,
        );
      }

      const extracted = await this.extractRequirements(savedJobIds);
      if (extracted) {
        this.logger.log(`Xếp hàng rút yêu cầu cho ${extracted} tin`);
      }

      const queued = await this.fanOut(run.userId, savedJobIds);

      return await this.prisma.scrapeRun.update({
        where: { id: runId },
        data: {
          status: 'DONE',
          jobsFound: cards.length,
          jobsNew: fresh.length,
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

  /** Cập nhật dữ liệu THẺ cho những tin đã có trong database. */
  private async refreshKnownCards(
    portal: string,
    cards: PortalJobCard[],
  ): Promise<number> {
    let updated = 0;

    for (const card of cards) {
      const postedAt = parsePostedAt(card.postedAt);
      const data = {
        ...(card.companyLogo ? { companyLogo: card.companyLogo } : {}),
        ...(postedAt ? { postedAt } : {}),
        ...(card.salary ? { salaryRaw: card.salary } : {}),
        ...(card.location ? { location: card.location } : {}),
      };
      if (!Object.keys(data).length) continue;

      try {
        await this.prisma.job.update({
          where: { source_externalId: { source: portal, externalId: card.id } },
          data,
        });
        updated += 1;
      } catch (error) {
        this.logger.warn(
          `Không làm mới được ${card.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return updated;
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

    this.logger.log(
      `Xếp hàng ${queued}/${plan.targets.length} lượt chấm cho ${users.length} hồ sơ` +
        (plan.dropped ? `; BỎ ${plan.dropped} lượt ngoài hạn ngạch` : '') +
        (plan.skippedThinProfiles
          ? `; bỏ qua ${plan.skippedThinProfiles} hồ sơ quá sơ sài`
          : ''),
    );
    return queued;
  }

  /**
   * Kèm cả lần quét của hệ thống: chính chúng mới là nguồn tin cho người dùng,
   * nên giấu đi thì lịch sử trông như không có gì xảy ra.
   */
  history(userId: string) {
    return this.prisma.scrapeRun.findMany({
      where: { OR: [{ userId }, { userId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async get(userId: string, id: string) {
    const run = await this.prisma.scrapeRun.findFirst({
      where: { id, OR: [{ userId }, { userId: null }] },
    });
    if (!run) throw new NotFoundException(`Không tìm thấy lần quét: ${id}`);
    return run;
  }
}
