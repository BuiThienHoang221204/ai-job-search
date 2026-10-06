import { Logger } from '@nestjs/common';
import type { Profile } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import { PromptBuilderService } from '@/modules/skills/services/prompt-builder.service';
import { MIN_COMPLETION_TO_SCORE } from '@/modules/matching/rules/match-write';
import {
  clusterProfiles,
  clusterQuery,
  occupationGroupOf,
  planFromProfile,
  taxonomyBaseline,
} from '../utils/query-plan';
import {
  searchPlanPrompt,
  PLAN_TIMEOUT_MS,
  SEARCH_PLAN_SYSTEM,
} from '../planning/search-plan.prompt';
import {
  searchPlanSchema,
  type SearchPlan,
} from '../planning/search-plan.schema';
import { messageOf } from '@/common/error-message';

export class QueryPlanner {
  private readonly logger = new Logger(QueryPlanner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptBuilderService,
    private readonly systemQueryLimit: number,
  ) {}

  private deterministicQueries(profile: Profile | null): SearchPlan {
    return { queries: planFromProfile(profile) };
  }

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
      const message = messageOf(error);
      this.logger.warn(
        `Tinh chỉnh truy vấn thất bại (${message}); dùng bản tất định`,
      );
      return { plan: baseline, modelId: null };
    }
  }

  async forSystem(
    portal: string,
    occupations: string[] | null,
  ): Promise<{ plan: SearchPlan; clusterCodes: string[] }> {
    const profiles = await this.prisma.profile.findMany({
      where: { completion: { gte: MIN_COMPLETION_TO_SCORE } },
      select: { headline: true, primarySkills: true, occupationCode: true },
    });

    const profileClusters = clusterProfiles(profiles);
    const covered = new Set(profileClusters.map((c) => c.clusterCode));
    const merged = [
      ...profileClusters,
      ...taxonomyBaseline().filter((c) => !covered.has(c.clusterCode)),
    ];
    const clusters = occupations
      ? merged.filter((c) =>
          occupations.includes(occupationGroupOf(c.clusterCode)),
        )
      : merged;
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
