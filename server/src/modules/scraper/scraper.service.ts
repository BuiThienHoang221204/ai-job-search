import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Profile, ScrapeRun } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { PromptBuilderService } from '../skills/prompt-builder.service.js';
import { PortalCliService, type PortalJobCard } from './portal-cli.service.js';
import { MIN_COMPLETION_TO_SCORE, pairKey, planFanOut } from './fan-out.js';
import { parsePostedAt } from './normalize.js';
import { searchPlanSchema, type SearchPlan } from './scraper.schema.js';

/// Số truy vấn tối đa cho một lần quét của hệ thống. Mỗi truy vấn là một
/// request tới portal, nên đây trực tiếp là tải đặt lên họ.
const SYSTEM_QUERY_LIMIT = 6;

/// Trần số tin lấy về một lần quét. Mỗi tin là một request `detail` nữa, và
/// sau đó là một lần gọi model để chấm điểm - nên con số này trực tiếp quyết
/// định tải lên cả ITviec lẫn gateway AI.
const MAX_JOBS_PER_RUN = 12;

/// Nghỉ giữa các request tới portal. robots.txt cho phép, nhưng không có
/// nghĩa là nên bắn liên tục.
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
    private readonly portals: PortalCliService,
    private readonly queue: QueueService,
    config: ConfigService,
  ) {
    this.defaultLocation =
      config.get<string>('scraper.defaultLocation') ?? 'Vietnam';
  }

  /// Sinh truy vấn trực tiếp từ hồ sơ, không gọi AI.
  ///
  /// Đây là đường mặc định chứ không phải đường dự phòng. Sinh từ khóa tìm
  /// việc chỉ là đọc lại primarySkills và headline - không có suy luận nào để
  /// model đóng góp, trong khi nó thêm một điểm hỏng và vài chục giây chờ đợi.
  private deterministicQueries(profile: Profile | null): SearchPlan {
    const city = profile?.location?.trim() || '';
    const skills = (profile?.primarySkills ?? []).slice(0, 4);
    const headline = profile?.headline?.trim();

    const queries: SearchPlan['queries'] = [];

    if (headline) {
      queries.push({
        query: headline
          .replace(/\(.*?\)/g, '')
          .trim()
          .slice(0, 60),
        location: city,
        rationale: 'Chức danh hiện tại trong hồ sơ.',
      });
    }
    for (const skill of skills) {
      queries.push({
        query: skill,
        location: city,
        rationale: `Kỹ năng chính: ${skill}.`,
      });
    }
    if (!queries.length) {
      queries.push({
        query: 'developer',
        location: city,
        rationale: 'Hồ sơ chưa có kỹ năng hay chức danh; quét rộng.',
      });
    }

    return { queries: queries.slice(0, 5) };
  }

  /// Tinh chỉnh truy vấn bằng AI. Tùy chọn: hỏng thì dùng bản tất định.
  private async refineQueries(
    profile: Profile | null,
    userId: string,
  ): Promise<{
    plan: SearchPlan;
    modelId: string;
  }> {
    const system = [
      'Bạn sinh từ khóa tìm việc cho một ứng viên ngành CNTT tại Việt Nam.',
      '',
      'Quy tắc bắt buộc:',
      '- Từ khóa phải NGẮN, 1-3 từ, bằng tiếng Anh. Tin tuyển dụng IT ở Việt Nam dùng tiếng Anh cho chức danh và công nghệ.',
      '- Chỉ dùng kỹ năng và chức danh CÓ THẬT trong hồ sơ. Không sinh từ khóa cho công nghệ ứng viên chưa biết.',
      '- Địa điểm phải khớp ràng buộc đi lại của ứng viên. Ứng viên không chấp nhận chuyển nơi ở thì chỉ tìm tại thành phố họ đang sống.',
      '- Truy vấn đầu tiên bám sát nhất: kỹ năng chính + chức danh hiện tại.',
      '- Các truy vấn sau mở rộng dần sang kỹ năng phụ và lĩnh vực liên quan, nhưng không được lạc sang nghề khác.',
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
      // Ngắn hạn hơn mặc định: đây chỉ là bước tinh chỉnh, không đáng để cả
      // lần quét nằm chờ gateway free.
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
    try {
      const refined = await this.refineQueries(profile, userId);
      this.logger.log(`Truy vấn do ${refined.modelId} tinh chỉnh`);
      return refined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Tinh chỉnh truy vấn thất bại (${message}); dùng bản tất định`,
      );
      return { plan: this.deterministicQueries(profile), modelId: null };
    }
  }

  /// `userId = null` tạo một lần quét của HỆ THỐNG (cron chạy). Xem ghi chú
  /// trên model ScrapeRun để biết vì sao quét chung thay vì quét theo từng
  /// người.
  async create(userId: string | null, portal: string): Promise<ScrapeRun> {
    if (!this.portals.has(portal)) {
      throw new NotFoundException(`Portal chưa được đăng ký: ${portal}`);
    }
    return this.prisma.scrapeRun.create({ data: { userId, portal } });
  }

  /// Từ khoá cho lần quét của hệ thống: gộp kỹ năng và chức danh của mọi hồ sơ
  /// đang hoạt động.
  ///
  /// KHÔNG gọi AI ở đây. Với một lần quét chung thì không có "ứng viên" nào để
  /// suy luận cho - việc cần làm chỉ là phủ được những gì người dùng đang tìm,
  /// mà một câu truy vấn DB trả lời chính xác hơn model.
  private async systemQueries(): Promise<SearchPlan> {
    const profiles = await this.prisma.profile.findMany({
      where: { completion: { gte: MIN_COMPLETION_TO_SCORE } },
      select: { headline: true, primarySkills: true, location: true },
    });

    // Đếm tần suất rồi lấy phổ biến nhất: kỹ năng nhiều người cần thì quét
    // trước, vì mỗi truy vấn là một request tới portal.
    const tally = new Map<string, number>();
    for (const profile of profiles) {
      for (const skill of profile.primarySkills.slice(0, 4)) {
        const key = skill.trim();
        if (key) tally.set(key, (tally.get(key) ?? 0) + 1);
      }
    }

    const ranked = [...tally.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, SYSTEM_QUERY_LIMIT);

    if (!ranked.length) {
      return {
        queries: [
          {
            query: 'developer',
            location: '',
            rationale: 'Chưa có hồ sơ nào đủ dữ liệu; quét rộng.',
          },
        ],
      };
    }

    return {
      queries: ranked.map(([skill, count]) => ({
        query: skill,
        location: '',
        rationale: `${count} hồ sơ khai kỹ năng này.`,
      })),
    };
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
      // --- Bước 1: sinh truy vấn ---
      // Quét của hệ thống thì gộp từ mọi hồ sơ và KHÔNG gọi AI; quét của một
      // người thì dựa trên hồ sơ người đó.
      const { plan, modelId } = run.userId
        ? await this.planQueries(
            await this.prisma.profile.findUnique({
              where: { userId: run.userId },
            }),
            run.userId,
          )
        : { plan: await this.systemQueries(), modelId: null };

      await this.prisma.scrapeRun.update({
        where: { id: runId },
        data: { queries: plan.queries, modelId },
      });

      // --- Bước 2: chạy CLI cho từng truy vấn (không AI) ---
      const seen = new Map<string, PortalJobCard>();
      for (const query of plan.queries) {
        if (seen.size >= MAX_JOBS_PER_RUN) break;

        const cards = await this.portals.search(run.portal, {
          query: query.query,
          // Lùi về địa điểm mặc định khi truy vấn không có: LinkedIn BẮT BUỘC
          // có --location và sẽ trả lỗi NO_LOCATION nếu thiếu, còn các portal
          // khác thì bỏ qua tham số này một cách vô hại.
          //
          // Lần quét của hệ thống luôn rơi vào nhánh này vì nó gộp kỹ năng của
          // mọi hồ sơ nên không có một địa điểm chung nào. Đã gặp thật: cron
          // 23:00 chạy xong itviec rồi hỏng ở linkedin đúng vì chỗ này.
          location: query.location || this.defaultLocation,
          limit: MAX_JOBS_PER_RUN,
        });
        // Chống trùng ngay trong lần quét: nhiều truy vấn thường trả về cùng
        // một tin.
        for (const card of cards)
          if (!seen.has(card.id)) seen.set(card.id, card);

        this.logger.log(
          `${run.portal} "${query.query}" -> ${cards.length} tin, tích lũy ${seen.size}`,
        );
        await sleep(POLITE_DELAY_MS);
      }

      const cards = [...seen.values()].slice(0, MAX_JOBS_PER_RUN);

      // --- Bước 3: bỏ tin đã có trong DB TRƯỚC khi tải chi tiết ---
      // Kiểm tra ở đây thay vì sau khi tải là có ý: mỗi lần tải chi tiết là
      // một request tới ITviec, và tin đã có trong DB thì không cần tải lại.
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

      // --- Bước 3b: làm mới dữ liệu THẺ của những tin đã có ---
      //
      // Tin đã có trong database vẫn cần cập nhật logo, ngày đăng và mức lương:
      // những trường này nằm SẴN trong kết quả tìm kiếm, không tốn thêm một
      // request nào. Bỏ qua chúng nghĩa là một tin quét về trước khi parser
      // biết đọc logo sẽ VĨNH VIỄN không có logo, dù quét lại bao nhiêu lần -
      // đã gặp đúng chuyện này với itviec và linkedin.
      //
      // Chỉ ghi trường nào đọc được: lượt sau đọc hụt (portal đổi bố cục) không
      // được phép xoá mất dữ liệu đã biết.
      const refreshed = await this.refreshKnownCards(
        run.portal,
        cards.filter((card) => known.has(card.id)),
      );
      if (refreshed) {
        this.logger.log(`Làm mới dữ liệu thẻ cho ${refreshed} tin đã có`);
      }

      // --- Bước 4: lấy mô tả và ghi DB ---
      const savedJobIds: string[] = [];
      let skipped = 0;

      for (const card of fresh) {
        // MỘT tin hỏng không được làm đổ cả lượt quét. Đã gặp thật: quét
        // VietnamWorks lưu xong 6 tin rồi tin thứ 7 tra chi tiết không thấy,
        // thế là cả lượt bị đánh FAILED và 6 tin kia không được xếp hàng chấm
        // điểm - công sức đổ sông. Portal nào cũng có tin bị gỡ giữa chừng,
        // nên đây là chuyện thường chứ không phải ngoại lệ hiếm.
        try {
          // Portal nào trả sẵn mô tả ngay trong kết quả tìm kiếm (VietnamWorks
          // gọi API JSON nên có) thì bỏ hẳn request chi tiết: vừa nhanh gấp
          // đôi, vừa bớt một chỗ có thể hỏng.
          let description = card.description ?? null;
          if (!description) {
            const detail = await this.portals.detail(run.portal, card.slug);
            description = detail.description;
            await sleep(POLITE_DELAY_MS);
          }

          // Không có mô tả thì không chấm điểm được - toàn bộ khung đánh giá
          // dựa trên yêu cầu công việc. Bỏ qua còn hơn lưu một bản ghi vô dụng.
          if (!description || description.length < 80) {
            this.logger.warn(`Bỏ qua ${card.slug}: mô tả quá ngắn hoặc trống`);
            skipped += 1;
            continue;
          }

          // Portal nói ngày đăng bằng chuỗi người đọc ("4 days ago",
          // "2025-07-21"); đổi sang mốc thời gian ngay tại đây. null nghĩa là
          // portal không nói - TopCV không bao giờ trả trường này - và giao
          // diện có nhánh riêng cho trường hợp đó.
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
              // Tin đã có trong database chỉ nhận được ngày đăng qua nhánh
              // này. Thiếu nó thì mọi tin quét trước đây sẽ VĨNH VIỄN không có
              // ngày, dù quét lại bao nhiêu lần.
              //
              // Chỉ ghi khi đọc được: lượt quét sau không đọc ra ngày (portal
              // đổi bố cục, hoặc tin đã tụt khỏi trang tìm kiếm) không được
              // phép xoá mất ngày đã biết.
              ...(postedAt ? { postedAt } : {}),
              // Logo cũng vậy, và cùng một lý do.
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

      // --- Bước 5: xếp hàng chấm điểm ---
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

  /// Cập nhật dữ liệu THẺ cho những tin đã có trong database.
  ///
  /// Không đụng tới `description`: lấy mô tả cần thêm một request cho mỗi tin,
  /// mà mô tả thì hiếm khi đổi. Ở đây chỉ ghi những trường đã nằm sẵn trong
  /// kết quả tìm kiếm.
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
      // Không có gì mới thì bỏ qua hẳn, đừng chạm vào bản ghi: một lệnh UPDATE
      // rỗng vẫn đẩy `updatedAt` lên và làm nhiễu mọi truy vấn theo thời gian.
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

  /// Xếp hàng chấm điểm cho các tin vừa lưu.
  ///
  /// Quét của một người: chỉ chấm cho người đó. Quét của hệ thống: nhân với
  /// mọi hồ sơ đủ dữ liệu - đây là chỗ số lượt gọi model bùng lên, nên phần
  /// quyết định nằm ở `planFanOut` để test được và để có trần rõ ràng.
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

    const [users, scored] = await Promise.all([
      this.prisma.profile.findMany({
        where: { completion: { gte: MIN_COMPLETION_TO_SCORE } },
        select: { userId: true, completion: true },
      }),
      this.prisma.jobMatch.findMany({
        where: { jobId: { in: jobIds } },
        select: { userId: true, jobId: true },
      }),
    ]);

    const plan = planFanOut({
      newJobIds: jobIds,
      users: users.map((row) => ({
        id: row.userId,
        completion: row.completion,
      })),
      alreadyScored: scored.map((row) => pairKey(row.userId, row.jobId)),
    });

    // Một lệnh cho cả lô thay vì một lệnh mỗi cặp: trần fan-out là 500 nên vòng
    // lặp cũ là tới 500 lần INSERT tuần tự.
    const queued = await this.queue.sendMany(
      QUEUE.EVALUATE_MATCH,
      plan.targets,
    );

    // Báo ra những gì đã cắt. Im lặng cắt bớt thì nhìn jobsQueued sẽ tưởng
    // quét được ít tin, chứ không biết là đã chạm trần.
    //
    // `queued` có thể nhỏ hơn `plan.targets.length` khi một cặp (user, job) đã
    // có việc đang chờ từ lượt trước - báo cả hai số để không ai phải đoán.
    this.logger.log(
      `Xếp hàng ${queued}/${plan.targets.length} lượt chấm cho ${users.length} hồ sơ` +
        (plan.dropped ? `; CẮT ${plan.dropped} lượt vì chạm trần` : '') +
        (plan.skippedThinProfiles
          ? `; bỏ qua ${plan.skippedThinProfiles} hồ sơ quá sơ sài`
          : ''),
    );
    return queued;
  }

  /// Kèm cả lần quét của hệ thống: chính chúng mới là nguồn tin cho người dùng,
  /// nên giấu đi thì lịch sử trông như không có gì xảy ra.
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
