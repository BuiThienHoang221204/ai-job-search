import { writeFileSync } from 'node:fs';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { daysAgo } from '@/common/duration';
import { messageOf } from '@/common/error-message';
import { PrismaService } from '@/prisma/prisma.service';
import {
  type Blacklist,
  deadModels,
  isBlocked,
  loadBlacklist,
  looksLikeOutage,
} from '../utils/model-blacklist';

const JOB_NAME = 'ai.blacklist-regen';
const WINDOW_DAYS = 7;
const MIN_CALLS = 5;
const CAP_FRACTION = 0.9;

@Injectable()
export class ModelBlacklistService
  implements OnModuleInit, OnApplicationBootstrap
{
  private readonly logger = new Logger(ModelBlacklistService.name);
  private readonly file: string;
  private data: Blacklist;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly prisma: PrismaService,
  ) {
    this.file = config.get<string>('ai.modelBlacklistFile')!;
    this.data = loadBlacklist(this.file);
  }

  blocks(ref: string): boolean {
    return isBlocked(ref, this.data);
  }

  private get schedule(): string {
    return this.config.get<string>('ai.blacklistSchedule')!;
  }

  onModuleInit(): void {
    const m = this.data.manual;
    this.logger.log(
      `Blacklist model: ${this.data.models.size} tự sinh + ${m.prefixes.length + m.suffixes.length + m.contains.length} cấm tay`,
    );
    if (!this.schedule) return;

    const timeZone = this.config.get<string>('cron.timezone')!;
    const job = new CronJob(
      this.schedule,
      () => void this.regenerate(),
      null,
      false,
      timeZone,
    );
    this.registry.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(`Cron tự động blacklist: "${this.schedule}" (${timeZone})`);
  }

  onApplicationBootstrap(): void {
    if (this.schedule) void this.regenerate();
  }

  /** Quét `ai_calls` trong cửa sổ, dựng LẠI blacklist từ các (lõi, model) hơn 5 lượt mà 0% thành công. Chặn nhiều bất thường thì bỏ qua (nghi gateway sập). Cập nhật in-memory và ghi file để người xem và sống qua restart. */
  async regenerate(): Promise<void> {
    try {
      const since = daysAgo(WINDOW_DAYS);
      const [totals, alive] = await Promise.all([
        this.prisma.aiCall.groupBy({
          by: ['provider', 'modelId'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        }),
        this.prisma.aiCall.groupBy({
          by: ['provider', 'modelId'],
          where: { createdAt: { gte: since }, ok: true },
        }),
      ]);

      const aliveSet = new Set(alive.map((a) => `${a.provider}/${a.modelId}`));
      const counts = totals.map((t) => ({
        id: `${t.provider}/${t.modelId}`,
        total: t._count._all,
      }));
      const dead = deadModels(counts, aliveSet, MIN_CALLS);

      if (
        counts.length === 0 ||
        looksLikeOutage(dead.length, counts.length, CAP_FRACTION)
      ) {
        this.logger.warn(
          `Bỏ qua cập nhật blacklist: ${dead.length}/${counts.length} model chết (dữ liệu bất thường), giữ list cũ (${this.data.models.size})`,
        );
        return;
      }

      this.data = { models: new Set(dead), manual: this.data.manual };
      this.writeFile(dead);
      this.logger.log(`Blacklist tự cập nhật: ${dead.length} model chết`);
    } catch (error) {
      this.logger.error(`Cập nhật blacklist thất bại: ${messageOf(error)}`);
    }
  }

  private writeFile(models: string[]): void {
    const body = {
      _comment:
        'Tu sinh boi ModelBlacklistService (cron tuan): (loi, model) >5 luot & 0% thanh cong trong 7 ngay. Sua tay se bi ghi de luot cron sau.',
      generatedAt: new Date().toISOString().slice(0, 10),
      windowDays: WINDOW_DAYS,
      minCalls: MIN_CALLS + 1,
      manual: this.data.manual,
      count: models.length,
      models,
    };
    try {
      writeFileSync(this.file, `${JSON.stringify(body, null, 2)}\n`);
    } catch (error) {
      this.logger.warn(`Không ghi được file blacklist: ${messageOf(error)}`);
    }
  }
}
