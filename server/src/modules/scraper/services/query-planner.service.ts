import { Logger } from '@nestjs/common';
import type { Profile } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AiService } from '../../ai/services/ai.service.js';
import { PromptBuilderService } from '../../skills/services/prompt-builder.service.js';
import { MIN_COMPLETION_TO_SCORE } from '../../matching/rules/match-write.js';
import {
  clusterProfiles,
  clusterQuery,
  planFromProfile,
} from '../utils/query-plan.js';
import {
  searchPlanPrompt,
  PLAN_TIMEOUT_MS,
  SEARCH_PLAN_SYSTEM,
} from '../planning/search-plan.prompt.js';
import {
  searchPlanSchema,
  type SearchPlan,
} from '../planning/search-plan.schema.js';

/** Quét CÁI GÌ: sinh danh sách từ khoá — từ hồ sơ (lượt người dùng) hoặc từ cụm nghề (lượt cron). KHÔNG phải provider Nest, `ScraperService` tự dựng. */
export class QueryPlanner {
  private readonly logger = new Logger(QueryPlanner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptBuilderService,
    private readonly systemQueryLimit: number,
  ) {}

  /** Bản KHÔNG gọi model, dựng thẳng từ hồ sơ. Vừa là đầu vào cho model vừa là đường lùi khi model hỏng. */
  private deterministicQueries(profile: Profile | null): SearchPlan {
    return { queries: planFromProfile(profile) };
  }

  /** `maxRetries: 0` vì đã có đường lùi tất định — thử lại chỉ làm chậm một lượt quét vốn đã dài. */
  private async refineQueries(
    profile: Profile | null,
    userId: string,
  ): Promise<{
    plan: SearchPlan;
    modelId: string;
  }> {
    const { object, modelId } = await this.ai.generateObject<SearchPlan>({
      schema: searchPlanSchema,
      context: { purpose: 'scrape.plan', userId },
      system: SEARCH_PLAN_SYSTEM,
      prompt: searchPlanPrompt(this.prompts.profileSummary(profile)),
      timeoutMs: PLAN_TIMEOUT_MS,
      maxRetries: 0,
    });
    return { plan: object, modelId };
  }

  /** Hồ sơ TRỐNG thì trả kế hoạch rỗng và KHÔNG gọi model — không có từ khoá mặc định nào là trung lập. */
  async forUser(
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

  /** Lượt cron: gom hồ sơ theo NGHỀ rồi xoay vòng cũ-trước, tie-break `size DESC` — cụm nhỏ luôn là nạn nhân khi chạm trần. */
  async forSystem(
    portal: string,
  ): Promise<{ plan: SearchPlan; clusterCodes: string[] }> {
    const profiles = await this.prisma.profile.findMany({
      where: { completion: { gte: MIN_COMPLETION_TO_SCORE } },
      select: { headline: true, primarySkills: true, occupationCode: true },
    });

    const clusters = clusterProfiles(profiles);
    const marks = await this.prisma.occupationCrawl.findMany({
      where: {
        portal,
        occupationCode: { in: clusters.map((c) => c.clusterCode) },
      },
      select: { occupationCode: true, lastCrawledAt: true },
    });

    const crawledAt = new Map(
      marks.map((mark) => [mark.occupationCode, mark.lastCrawledAt.getTime()]),
    );

    const picked = [...clusters]
      .sort(
        (a, b) =>
          (crawledAt.get(a.clusterCode) ?? 0) -
            (crawledAt.get(b.clusterCode) ?? 0) || b.size - a.size,
      )
      .slice(0, this.systemQueryLimit);

    return {
      plan: { queries: picked.map(clusterQuery) },
      clusterCodes: picked.map((cluster) => cluster.clusterCode),
    };
  }

  /** Chỉ đóng dấu nghề THẬT SỰ gửi được request: đóng nhầm là lỗi tự nuôi, nghề đó vòng sau lại rơi đúng chỗ bị cắt. */
  async markCrawled(portal: string, clusterCodes: string[]): Promise<void> {
    const now = new Date();
    for (const occupationCode of clusterCodes) {
      await this.prisma.occupationCrawl.upsert({
        where: { portal_occupationCode: { portal, occupationCode } },
        create: { portal, occupationCode, lastCrawledAt: now },
        update: { lastCrawledAt: now },
      });
    }
  }
}
