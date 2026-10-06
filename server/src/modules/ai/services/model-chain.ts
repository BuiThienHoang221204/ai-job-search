import type { Logger } from '@nestjs/common';
import {
  classifyFailure,
  isAccessDenied,
  isModelRetired,
  isRateLimited,
  isTransientUpstream,
  ModelUnavailableError,
} from '../utils/failure-kind';
import { formatModelRef, parseModelRef } from '../utils/model-ref';
import { providerIds } from '../providers/index';

export const DEFAULT_CHAIN_BUDGET_MS = 240_000;

export type ModelChainOptions = {
  defaultModelId: string;
  defaultProviderId: string;
  fallbackModelIds: string[];
  budgetMs?: number;
  logger: Logger;
};

function skipReason(error: unknown): string | null {
  if (error instanceof ModelUnavailableError) return error.message;
  if (isModelRetired(error)) return 'gateway đã rút model này';
  if (isRateLimited(error)) return 'hết hạn mức';
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

  /** So trùng theo dạng ĐẦY ĐỦ `lõi/model`; `fallbackOverride` thay hẳn `MODEL_FALLBACK_IDS`. */
  links(
    requested?: string,
    fallbackOverride?: string[],
  ): Array<string | undefined> {
    const first = requested ?? (this.options.defaultModelId || undefined);
    const chain: Array<string | undefined> = [first];
    const seen = new Set([
      this.canonical(first ?? this.options.defaultModelId),
    ]);

    for (const id of fallbackOverride ?? this.options.fallbackModelIds) {
      const key = this.canonical(id);
      if (seen.has(key)) continue;
      seen.add(key);
      chain.push(id);
    }
    return chain;
  }

  /** Lỗi thuộc về model thì đi tiếp mắt xích (xem `skipReason`), lỗi của tác vụ thì ném ngay. */
  async run<T>(
    requested: string | undefined,
    attempt: (modelId: string | undefined) => Promise<T>,
    budgetOverrideMs?: number,
    fallbackOverride?: string[],
  ): Promise<T> {
    const chain = this.links(requested, fallbackOverride);
    const budgetMs =
      budgetOverrideMs ?? this.options.budgetMs ?? DEFAULT_CHAIN_BUDGET_MS;
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
        return await attempt(modelId);
      } catch (error) {
        const reason = skipReason(error);
        if (reason === null) throw error;

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
