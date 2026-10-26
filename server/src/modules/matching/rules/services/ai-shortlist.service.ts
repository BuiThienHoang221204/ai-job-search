import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@/generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { QUEUE, QueueService } from '@/modules/queue/queue.service';
import { MIN_COMPLETION_TO_SCORE } from '../match-write';
import { planShortlist } from '../ai-shortlist';
import type { ShortlistResult, ShortlistRow } from '../types';
import {
  profileFit,
  needsOccupation,
} from '@/modules/jobs/utils/occupation-gate';
import { whereFrom } from '@/modules/jobs/utils/job-view';
import { HOUR_MS } from '@/common/duration';

@Injectable()
export class AiShortlistService {
  private readonly logger = new Logger(AiShortlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<boolean>('matching.aiAuto')!;
  }

  private get topN(): number {
    return this.config.get<number>('matching.aiTopN')!;
  }

  private get maxPerRun(): number {
    return this.config.get<number>('matching.aiMaxPerRun')!;
  }

  private get cooldownHours(): number {
    return this.config.get<number>('matching.aiCooldownHours')!;
  }

  private get minPercent(): number {
    return this.config.get<number>('matching.minPercent')!;
  }

  private async topRows(userId: string | undefined): Promise<ShortlistRow[]> {
    const cooldownBefore = new Date(Date.now() - this.cooldownHours * HOUR_MS);
    const profiles = await this.prisma.profile.findMany({
      where: {
        completion: { gte: MIN_COMPLETION_TO_SCORE },
        OR: [{ lastFanOutAt: null }, { lastFanOutAt: { lt: cooldownBefore } }],
        ...(userId ? { userId } : {}),
      },
      select: {
        userId: true,
        lastFanOutAt: true,
        occupationCode: true,
        subOccupationCodes: true,
        preferredProvinces: true,
        experienceLevel: true,
        experiences: true,
      },
    });

    const scopes: Prisma.JobRequirementMatchWhereInput[] = [];
    for (const profile of profiles) {
      const fit = profileFit(profile);
      if (needsOccupation(fit)) continue;
      const query = profile.lastFanOutAt
        ? { scored: true, since: profile.lastFanOutAt.toISOString() }
        : { scored: true };
      scopes.push({
        userId: profile.userId,
        job: {
          ...whereFrom(query, profile.userId, fit),
          matches: { none: { userId: profile.userId } },
        },
      });
    }
    if (!scopes.length) return [];

    return this.prisma.jobRequirementMatch.findMany({
      where: {
        OR: scopes,
        percent: { gte: this.minPercent },
        AND: [
          { OR: [{ eligibility: null }, { eligibility: { not: 'FAIL' } }] },
        ],
      },
      orderBy: [
        { userId: 'asc' },
        { percent: 'desc' },
        { rank: 'desc' },
        { job: { scrapedAt: 'desc' } },
      ],
      select: { userId: true, jobId: true, rank: true },
    });
  }

  async dispatch(userId?: string): Promise<ShortlistResult> {
    if (!this.enabled) {
      this.logger.debug('Phát suất AI đang TẮT (MATCH_AI_AUTO=false)');
      return { queued: 0, served: 0, deferred: 0 };
    }

    const rows = await this.topRows(userId);
    if (!rows.length) return { queued: 0, served: 0, deferred: 0 };

    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: [...new Set(rows.map((row) => row.userId))] } },
      select: { userId: true, lastFanOutAt: true },
    });

    const plan = planShortlist({
      rows,
      lastFanOutAt: new Map(
        profiles.map((row) => [row.userId, row.lastFanOutAt]),
      ),
      topN: this.topN,
      maxPerRun: this.maxPerRun,
    });

    const queued = await this.queue.sendMany(
      QUEUE.EVALUATE_MATCH,
      plan.targets,
    );

    if (plan.served.length) {
      await this.prisma.profile.updateMany({
        where: { userId: { in: plan.served } },
        data: { lastFanOutAt: new Date() },
      });
    }

    this.logger.log(
      `Phát ${queued} suất AI cho ${plan.served.length} hồ sơ` +
        (plan.deferred ? `; HOÃN ${plan.deferred} hồ sơ sang lượt sau` : ''),
    );

    return {
      queued,
      served: plan.served.length,
      deferred: plan.deferred,
    };
  }
}
