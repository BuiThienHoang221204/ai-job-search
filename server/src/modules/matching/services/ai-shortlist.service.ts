import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { QUEUE, QueueService } from '../../queue/queue.service.js';
import { MIN_COMPLETION_TO_SCORE } from '../../scraper/fan-out.js';
import {
  AI_TOP_N,
  COOLDOWN_HOURS,
  MAX_SHORTLIST_PER_RUN,
  planShortlist,
  type ShortlistRow,
} from '../ai-shortlist.js';

const HOUR_MS = 60 * 60 * 1000;

export type ShortlistResult = {
  queued: number;
  served: number;
  deferred: number;
};

@Injectable()
export class AiShortlistService {
  private readonly logger = new Logger(AiShortlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly config: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<boolean>('matching.aiAuto') ?? false;
  }

  private get topN(): number {
    return this.config.get<number>('matching.aiTopN') ?? AI_TOP_N;
  }

  private get maxPerRun(): number {
    return (
      this.config.get<number>('matching.aiMaxPerRun') ?? MAX_SHORTLIST_PER_RUN
    );
  }

  private get cooldownHours(): number {
    return (
      this.config.get<number>('matching.aiCooldownHours') ?? COOLDOWN_HOURS
    );
  }

  private get minPercent(): number {
    return this.config.get<number>('matching.minPercent') ?? 50;
  }

  private topRows(userId: string | undefined): Promise<ShortlistRow[]> {
    const cooldownBefore = new Date(Date.now() - this.cooldownHours * HOUR_MS);

    return this.prisma.$queryRawUnsafe<ShortlistRow[]>(
      `select t."userId", t."jobId", t.rank
       from (
         select r."userId",
                r."jobId",
                r.rank,
                row_number() over (
                  partition by r."userId"
                  order by r.rank desc, r.met desc, j."scrapedAt" desc, r."jobId" desc
                ) as rn
         from job_requirement_matches r
         join jobs j on j.id = r."jobId"
         join profiles p on p."userId" = r."userId"
         left join job_matches m
                on m."userId" = r."userId" and m."jobId" = r."jobId"
         where r.percent >= $1
           and r.rank > 0
           and (r.eligibility is null or r.eligibility <> 'FAIL')
           and m.id is null
           and j."duplicateOfId" is null
           and p.completion >= $2
           and (p."lastFanOutAt" is null or p."lastFanOutAt" < $3)
           and (p."lastFanOutAt" is null or j."scrapedAt" > p."lastFanOutAt")
           ${userId ? 'and r."userId" = $5' : ''}
       ) t
       where t.rn <= $4
       order by t."userId", t.rn`,
      ...[
        this.minPercent,
        MIN_COMPLETION_TO_SCORE,
        cooldownBefore,
        this.topN,
        ...(userId ? [userId] : []),
      ],
    );
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
