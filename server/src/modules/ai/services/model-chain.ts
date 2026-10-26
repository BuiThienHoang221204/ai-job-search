import type { Logger } from '@nestjs/common';
import {
  classifyFailure,
  isAccessDenied,
  isModelRetired,
  isRateLimited,
  isTooLargeForModel,
  isTransientUpstream,
  ModelUnavailableError,
} from '@/common/ai/failure-kind';
import { formatModelRef, parseModelRef } from '../utils/model-ref';
import { providerIds } from '../providers/index';

export type ModelHealthTracker = {
  mainChain(): string[];
  isCoolingDown(modelId: string): boolean;
  recordSuccess(modelId: string): void;
  recordFailure(modelId: string, reason: string): void;
};

export type ModelChainOptions = {
  defaultModelId: string;
  defaultProviderId: string;
  fallbackModelIds: string[];
  budgetMs: number;
  logger: Logger;
  pool?: ModelHealthTracker;
};

function skipReason(error: unknown): string | null {
  if (error instanceof ModelUnavailableError) return error.message;
  if (isModelRetired(error)) return 'gateway đã rút model này';
  if (isRateLimited(error)) return 'hết hạn mức';
  if (isTooLargeForModel(error)) return 'prompt vượt trần token của model';
  if (isAccessDenied(error)) return 'lõi từ chối khoá hoặc model này';
  if (isTransientUpstream(error)) return 'lõi trả 5xx';
  const kind = classifyFailure(error);
  if (kind === 'TIMEOUT') return 'mắt xích chậm, vượt timeout';
  if (kind === 'SCHEMA') return 'model trả sai định dạng';
  return null;
}

export class ModelChain {
  constructor(private readonly options: ModelChainOptions) {}

  private canonical(ref: string): string {
    return formatModelRef(
      parseModelRef(ref, providerIds(), this.options.defaultProviderId),
    );
  }

  /** Khoá `lõi/model` của một mắt xích; `undefined` là model mặc định. */
  private keyOf(modelId: string | undefined): string {
    return this.canonical(modelId ?? this.options.defaultModelId);
  }

  /** So trùng theo dạng ĐẦY ĐỦ `lõi/model`; `fallbackOverride` thay hẳn chuỗi chung; model đang bị cách ly bị bỏ ra trừ khi cả chuỗi đều đang bị cách ly. */
  links(
    requested?: string,
    fallbackOverride?: string[],
  ): Array<string | undefined> {
    const pooled = this.options.pool?.mainChain() ?? [];
    const fallbacks =
      fallbackOverride ??
      (pooled.length ? pooled : this.options.fallbackModelIds);
    const first =
      requested ?? pooled[0] ?? (this.options.defaultModelId || undefined);
    const chain: Array<string | undefined> = [first];
    const seen = new Set([this.keyOf(first)]);

    for (const id of fallbacks) {
      const key = this.canonical(id);
      if (seen.has(key)) continue;
      seen.add(key);
      chain.push(id);
    }

    const pool = this.options.pool;
    if (!pool) return chain;
    const open = chain.filter((id) => !pool.isCoolingDown(this.keyOf(id)));
    return open.length ? open : chain;
  }

  /** Lỗi thuộc về model thì đi tiếp mắt xích (xem `skipReason`), lỗi của tác vụ thì ném ngay. */
  async run<T>(
    requested: string | undefined,
    attempt: (modelId: string | undefined) => Promise<T>,
    fallbackOverride?: string[],
  ): Promise<T> {
    const chain = this.links(requested, fallbackOverride);
    const { budgetMs } = this.options;
    const startedAt = Date.now();
    let lastSkipped: unknown;

    for (const [index, modelId] of chain.entries()) {
      const elapsed = Date.now() - startedAt;
      if (index > 0 && elapsed >= budgetMs) {
        this.options.logger.warn(
          `Dừng chuỗi sau ${Math.round(elapsed / 1000)}s: đã vượt ngân sách ${Math.round(budgetMs / 1000)}s, còn ${chain.length - index} mắt xích chưa thử`,
        );
        throw lastSkipped;
      }

      try {
        const result = await attempt(modelId);
        this.options.pool?.recordSuccess(this.keyOf(modelId));
        return result;
      } catch (error) {
        const reason = skipReason(error);
        if (reason === null) throw error;
        if (!isTooLargeForModel(error)) {
          this.options.pool?.recordFailure(this.keyOf(modelId), reason);
        }

        lastSkipped = error;
        const next = chain[index + 1];
        this.options.logger.warn(
          next
            ? `Bỏ qua ${modelId ?? '(mặc định)'} (${reason}), thử ${next}`
            : `Bỏ qua ${modelId ?? '(mặc định)'} (${reason}) và không còn mắt xích dự phòng`,
        );
      }
    }

    throw lastSkipped;
  }
}
