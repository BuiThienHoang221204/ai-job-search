import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { z } from 'zod';
import { messageOf } from '@/common/error-message';
import { isProbeCandidate } from '../utils/model-pool';
import { AiService } from './ai.service';
import { ModelCatalogService } from './model-catalog.service';
import { ModelPoolService, type ModelPoolStatus } from './model-pool.service';

const JOB_NAME = 'ai.healthcheck';

const ProbeSchema = z.object({ ok: z.boolean(), echo: z.number() });

export type ModelHealthStatus = ModelPoolStatus & {
  isRefreshing: boolean;
  lastRefreshedAt: number;
};

@Injectable()
export class ModelHealthService
  implements OnModuleInit, OnApplicationBootstrap
{
  private readonly logger = new Logger(ModelHealthService.name);
  private running?: Promise<void>;
  private lastRefreshedAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly catalog: ModelCatalogService,
    private readonly ai: AiService,
    private readonly pool: ModelPoolService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<boolean>('ai.healthcheck.enabled')!;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Kiểm tra model đang TẮT (AI_HEALTHCHECK_ENABLED=false)');
      return;
    }

    const schedule = this.config.get<string>('ai.healthcheck.schedule')!;
    const timeZone = this.config.get<string>('cron.timezone')!;
    const job = new CronJob(
      schedule,
      () => void this.refresh(),
      null,
      false,
      timeZone,
    );
    this.registry.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(`Cron kiểm tra model: "${schedule}" theo giờ ${timeZone}`);
  }

  onApplicationBootstrap(): void {
    if (this.enabled) this.pool.trackFirstRefresh(this.refresh());
  }

  status(): ModelHealthStatus {
    return {
      ...this.pool.status(),
      isRefreshing: this.running !== undefined,
      lastRefreshedAt: this.lastRefreshedAt,
    };
  }

  /** Quét model mới của các lõi rồi probe toàn bộ bể; lượt trước chưa xong thì trả về chính lượt đó. */
  refresh(): Promise<void> {
    this.running ??= this.discoverAndProbe().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  /** Một lượt kiểm tra: quét model mới của cả hai bể rồi probe tuần tự từng model; lỗi chỉ ghi log. */
  private async discoverAndProbe(): Promise<void> {
    try {
      const main = await this.discover(
        this.config.get<string[]>('ai.mainProviders')!,
        this.pool.mainSeeds(),
      );
      const fast = await this.discover(
        this.config.get<string[]>('ai.fastProviders')!,
        this.pool.fastSeeds(),
      );
      this.pool.setDiscovered(main, fast);

      const refs = new Set([
        ...this.pool.mainChain(),
        ...this.pool.fastChain(),
      ]);
      let healthy = 0;
      for (const ref of refs) {
        if (await this.probe(ref)) healthy += 1;
      }

      this.lastRefreshedAt = Date.now();
      this.logger.log(`Kiểm tra model xong: ${healthy}/${refs.size} khoẻ`);
    } catch (error) {
      this.logger.error(`Kiểm tra model hỏng: ${messageOf(error)}`);
    }
  }

  /** Hỏi `/models` của từng lõi, lọc model chat chưa ghim, lấy tối đa `DISCOVER_PER_PROVIDER` model mỗi lõi. */
  private async discover(
    providers: string[],
    seeds: string[],
  ): Promise<string[]> {
    const found: string[] = [];
    for (const providerId of providers) {
      const refs = await this.catalog.discoverModelsFor(providerId);
      const fresh = refs.filter(
        (ref) => isProbeCandidate(ref) && !seeds.includes(ref),
      );
      found.push(...fresh);
    }
    return found;
  }

  /** Gọi đúng một model bằng prompt `{ok, echo}` (không chuyển sang model khác), ghi khoẻ/trượt và độ trễ vào bể. */
  private async probe(modelId: string): Promise<boolean> {
    const startedAt = Date.now();
    try {
      const { object } = await this.ai.generateObject({
        schema: ProbeSchema,
        system: 'You are a health probe.',
        prompt: 'Respond in JSON with ok=true and echo=123.',
        context: { purpose: 'model.probe' },
        modelId,
        fallbackModelIds: [],
        maxRetries: 0,
        timeoutMs: this.config.get<number>('ai.healthcheck.probeTimeoutMs')!,
      });
      const healthy = object.ok && object.echo === 123;
      this.pool.recordProbe(
        modelId,
        healthy,
        Date.now() - startedAt,
        healthy ? undefined : 'Trả JSON đúng dạng nhưng sai giá trị',
      );
      return healthy;
    } catch (error) {
      this.pool.recordProbe(modelId, false, 0, messageOf(error));
      return false;
    }
  }
}
