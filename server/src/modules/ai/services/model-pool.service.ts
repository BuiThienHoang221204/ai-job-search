import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MINUTE_MS } from '@/common/duration';
import { providerIds } from '../providers/index';
import { setFastPoolResolver } from '../utils/model-env';
import { rankModels, type ModelHealth } from '../utils/model-pool';
import { formatModelRef, parseModelRef } from '../utils/model-ref';

export type ModelPoolStatus = {
  mainPool: string[];
  fastPool: string[];
  mainProviders: string[];
  fastProviders: string[];
  cooldownMs: number;
  models: ModelHealth[];
};

@Injectable()
export class ModelPoolService {
  private readonly logger = new Logger(ModelPoolService.name);
  private readonly health = new Map<string, ModelHealth>();
  private discovered: { main: string[]; fast: string[] } = {
    main: [],
    fast: [],
  };
  private firstRefresh?: Promise<void>;

  constructor(private readonly config: ConfigService) {
    setFastPoolResolver(() => this.fastChain());
  }

  private get mainProviders(): string[] {
    return this.config.get<string[]>('ai.mainProviders')!;
  }

  private get fastProviders(): string[] {
    return this.config.get<string[]>('ai.fastProviders')!;
  }

  private get cooldownMs(): number {
    return this.config.get<number>('ai.healthcheck.circuitBreakerCooldownMs')!;
  }

  /** Chuẩn hoá về `lõi/model` để `auto/fast` và `omniroute/auto/fast` là cùng một khoá. */
  private canonical(ref: string): string {
    const defaultProviderId = this.config.get<string>('ai.provider')!;
    return formatModelRef(parseModelRef(ref, providerIds(), defaultProviderId));
  }

  /** Model ghim bằng `MODEL_ID` + `MODEL_FALLBACK_IDS`; để trống thì trả `[]`. */
  mainSeeds(): string[] {
    const ids = [
      this.config.get<string>('ai.modelId')!,
      ...this.config.get<string[]>('ai.fallbackModelIds')!,
    ];
    return ids.filter(Boolean).map((id) => this.canonical(id));
  }

  /** Model ghim bằng `AI_FAST_MODEL_ID` + `AI_FAST_FALLBACK_IDS`; để trống thì trả `[]`. */
  fastSeeds(): string[] {
    const ids = [
      this.config.get<string>('ai.fastModelId')!,
      ...this.config.get<string[]>('ai.fastFallbackModelIds')!,
    ];
    return ids.filter(Boolean).map((id) => this.canonical(id));
  }

  setDiscovered(main: string[], fast: string[]): void {
    this.discovered = { main, fast };
    const inUse = new Set([...this.mainChain(), ...this.fastChain()]);
    for (const modelId of this.health.keys()) {
      if (!inUse.has(modelId)) this.health.delete(modelId);
    }
  }

  trackFirstRefresh(run: Promise<void>): void {
    this.firstRefresh ??= run;
  }

  /** Đợi lượt kiểm tra model đầu tiên; kiểm tra bị tắt thì trả ngay. */
  async waitForModels(): Promise<void> {
    await this.firstRefresh;
  }

  /** Chuỗi bể main đã xếp hạng (model ghim + model quét được), tính lại mỗi lần gọi. */
  mainChain(): string[] {
    const seeds = this.mainSeeds();
    return rankModels(
      [...seeds, ...this.discovered.main],
      this.mainProviders,
      seeds,
      this.health,
    );
  }

  /** Chuỗi bể fast đã xếp hạng (model ghim + model quét được), tính lại mỗi lần gọi. */
  fastChain(): string[] {
    const seeds = this.fastSeeds();
    return rankModels(
      [...seeds, ...this.discovered.fast],
      this.fastProviders,
      seeds,
      this.health,
    );
  }

  /** Bản ghi tình trạng của một model; chưa có thì tạo mới ở trạng thái khoẻ. */
  private entry(modelId: string): ModelHealth {
    let info = this.health.get(modelId);
    if (!info) {
      info = {
        modelId,
        healthy: true,
        latencyMs: 0,
        lastCheckedAt: 0,
        consecutiveFailures: 0,
      };
      this.health.set(modelId, info);
    }
    return info;
  }

  /** Model đang trong thời gian cách ly của cầu dao thì `ModelChain` bỏ qua. */
  isCoolingDown(modelId: string): boolean {
    return (this.health.get(modelId)?.cooldownUntil ?? 0) > Date.now();
  }

  /** Ghi kết quả probe; không đụng bộ đếm lỗi vì `ModelChain` đã tự ghi khi probe đi qua chuỗi. */
  recordProbe(
    modelId: string,
    healthy: boolean,
    latencyMs: number,
    error?: string,
  ): void {
    const info = this.entry(modelId);
    info.healthy = healthy;
    info.latencyMs = latencyMs;
    info.lastCheckedAt = Date.now();
    info.error = error;
  }

  /** Gọi thành công (kể cả probe): đặt bộ đếm lỗi về 0 và mở cầu dao. */
  recordSuccess(modelId: string): void {
    const info = this.health.get(modelId);
    if (!info) return;
    info.healthy = true;
    info.consecutiveFailures = 0;
    info.cooldownUntil = undefined;
    info.error = undefined;
  }

  /** Cầu dao: đủ ngưỡng lỗi liên tiếp thì cách ly model trong `circuitBreakerCooldownMs`. */
  recordFailure(modelId: string, reason: string): void {
    const info = this.entry(modelId);
    info.consecutiveFailures += 1;
    info.error = reason;

    const threshold = this.config.get<number>(
      'ai.healthcheck.circuitBreakerThreshold',
    )!;
    if (info.consecutiveFailures < threshold || this.isCoolingDown(modelId)) {
      return;
    }

    info.cooldownUntil = Date.now() + this.cooldownMs;
    this.logger.warn(
      `Cách ly ${modelId} ${Math.round(this.cooldownMs / MINUTE_MS)} phút sau ${info.consecutiveFailures} lỗi liên tiếp (${reason})`,
    );
  }

  status(): ModelPoolStatus {
    return {
      mainPool: this.mainChain(),
      fastPool: this.fastChain(),
      mainProviders: this.mainProviders,
      fastProviders: this.fastProviders,
      cooldownMs: this.cooldownMs,
      models: [...this.health.values()],
    };
  }
}
