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
import { MINUTE_MS } from '@/common/duration';
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

const REMEMBER_MS = 30 * MINUTE_MS;

type LinkAttempt<T> = (
  modelId: string | undefined,
  isLast: boolean,
  signal: AbortSignal,
) => Promise<T>;

type ChainRun<T> = {
  chain: Array<string | undefined>;
  attempt: LinkAttempt<T>;
  purpose?: string;
  requested?: string;
  startedAt: number;
};

export class ModelChain {
  private readonly lastGood = new Map<string, { key: string; at: number }>();

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

  private remembered(
    purpose: string | undefined,
    candidates: string[],
  ): string | undefined {
    if (!purpose) return undefined;
    const memo = this.lastGood.get(purpose);
    if (!memo || Date.now() - memo.at > REMEMBER_MS) return undefined;
    return candidates.find((id) => this.canonical(id) === memo.key);
  }

  /** So trùng theo dạng ĐẦY ĐỦ `lõi/model`; `fallbackOverride` thay hẳn chuỗi chung; không chỉ định model thì mắt đầu là model vừa chạy được của cùng `purpose` (còn hạn, còn trong chuỗi); model đang bị cách ly bị bỏ ra trừ khi cả chuỗi đều đang bị cách ly. */
  links(
    requested?: string,
    fallbackOverride?: string[],
    purpose?: string,
  ): Array<string | undefined> {
    const pooled = this.options.pool?.mainChain() ?? [];
    const fallbacks =
      fallbackOverride ??
      (pooled.length ? pooled : this.options.fallbackModelIds);
    const first =
      requested ??
      this.remembered(purpose, fallbacks) ??
      pooled[0] ??
      (this.options.defaultModelId || undefined);
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

  /** Lỗi thuộc về model thì đi tiếp mắt xích (xem `skipReason`), lỗi của tác vụ thì ném ngay; nhớ model chạy được theo `purpose`; có `hedgeAfterMs` thì mắt đầu chậm quá mốc đó sẽ chạy song song phần còn lại của chuỗi, bên xong trước thắng, bên kia bị huỷ. */
  async run<T>(
    requested: string | undefined,
    attempt: LinkAttempt<T>,
    fallbackOverride?: string[],
    purpose?: string,
    hedgeAfterMs?: number,
  ): Promise<T> {
    const chain = this.links(requested, fallbackOverride, purpose);
    const run: ChainRun<T> = {
      chain,
      attempt,
      purpose,
      requested,
      startedAt: Date.now(),
    };
    if (!hedgeAfterMs || chain.length < 2) {
      return this.sequence(run, 0, chain.length, new AbortController().signal);
    }

    const first = new AbortController();
    const rest = new AbortController();
    const primary = this.sequence(run, 0, 1, first.signal);
    let timer: NodeJS.Timeout | undefined;
    const slow = new Promise<'slow'>((resolve) => {
      timer = setTimeout(() => resolve('slow'), hedgeAfterMs);
    });
    const outcome = await Promise.race([
      primary.then(
        () => 'done' as const,
        () => 'failed' as const,
      ),
      slow,
    ]).finally(() => clearTimeout(timer));

    if (outcome === 'done') return primary;
    if (outcome === 'failed') {
      await primary.catch((error: unknown) => {
        if (skipReason(error) === null) throw error;
      });
      return this.sequence(run, 1, chain.length, rest.signal);
    }

    this.options.logger.warn(
      `${chain[0] ?? '(mặc định)'} chưa xong sau ${Math.round(hedgeAfterMs / 1000)}s, chạy song song ${chain[1]}`,
    );
    const backup = this.sequence(run, 1, chain.length, rest.signal);
    try {
      const winner = await Promise.any([
        primary.then((result) => ({ result, loser: rest })),
        backup.then((result) => ({ result, loser: first })),
      ]);
      winner.loser.abort();
      return winner.result;
    } catch (error) {
      throw (error as AggregateError).errors[1];
    }
  }

  /** Thử lần lượt các mắt `[from, to)` của chuỗi; `signal` bị huỷ (thua cuộc đua) thì dừng mà không ghi lỗi cho model. */
  private async sequence<T>(
    run: ChainRun<T>,
    from: number,
    to: number,
    signal: AbortSignal,
  ): Promise<T> {
    const { chain, attempt, purpose, requested, startedAt } = run;
    const { budgetMs } = this.options;
    let lastSkipped: unknown;

    for (let index = from; index < to; index += 1) {
      const modelId = chain[index];
      const elapsed = Date.now() - startedAt;
      if (index > 0 && elapsed >= budgetMs) {
        this.options.logger.warn(
          `Dừng chuỗi sau ${Math.round(elapsed / 1000)}s: đã vượt ngân sách ${Math.round(budgetMs / 1000)}s, còn ${chain.length - index} mắt xích chưa thử`,
        );
        throw lastSkipped;
      }

      try {
        const result = await attempt(
          modelId,
          index === chain.length - 1,
          signal,
        );
        const key = this.keyOf(modelId);
        this.options.pool?.recordSuccess(key);
        if (purpose && !requested) {
          this.lastGood.set(purpose, { key, at: Date.now() });
        }
        return result;
      } catch (error) {
        if (signal.aborted) throw error;
        const reason = skipReason(error);
        if (reason === null) throw error;
        if (!isTooLargeForModel(error)) {
          const key = this.keyOf(modelId);
          this.options.pool?.recordFailure(key, reason);
          if (purpose && this.lastGood.get(purpose)?.key === key) {
            this.lastGood.delete(purpose);
          }
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
