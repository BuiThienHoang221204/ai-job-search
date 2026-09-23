import type { Logger } from '@nestjs/common';
import {
  isAccessDenied,
  isModelRetired,
  isRateLimited,
  isTransientUpstream,
} from '../utils/failure-kind.js';
import { formatModelRef, parseModelRef } from '../utils/model-ref.js';
import { providerIds } from '../providers/index.js';
import { ModelUnavailableError } from '../utils/failure-kind.js';

export const DEFAULT_CHAIN_BUDGET_MS = 240_000;

export type ModelChainOptions = {
  defaultModelId: string;
  defaultProviderId: string;
  fallbackModelIds: string[];
  budgetMs?: number;
  logger: Logger;
};

/** Phần CHÍNH SÁCH, tách khỏi `AiService`: nó không biết SDK, prisma hay schema, chỉ trả lời "lỗi này là mắt xích hỏng hay tác vụ hỏng". */
export class ModelChain {
  constructor(private readonly options: ModelChainOptions) {}

  /** Dạng đầy đủ `lõi/model`, để so trùng không phụ thuộc cách viết tắt. */
  private canonical(ref: string): string {
    return formatModelRef(
      parseModelRef(ref, providerIds(), this.options.defaultProviderId),
    );
  }

  /** So trùng theo dạng ĐẦY ĐỦ, nếu không thì `x` và `opencode/x` thành hai mắt xích và model vừa hết hạn mức được thử lại ngay. */
  links(requested?: string): Array<string | undefined> {
    const first = requested ?? (this.options.defaultModelId || undefined);
    const chain: Array<string | undefined> = [first];
    const seen = new Set([
      this.canonical(first ?? this.options.defaultModelId),
    ]);

    for (const id of this.options.fallbackModelIds) {
      const key = this.canonical(id);
      if (seen.has(key)) continue;
      seen.add(key);
      chain.push(id);
    }
    return chain;
  }

  /** Đi tiếp trong đúng NĂM trường hợp, cả năm nghĩa là "mắt xích này không dùng được". Lỗi schema ném NGAY — đổi model khi model trả sai định dạng sẽ giấu mất tín hiệu "model này quá yếu". */
  async run<T>(
    requested: string | undefined,
    attempt: (modelId: string | undefined) => Promise<T>,
    budgetOverrideMs?: number,
  ): Promise<T> {
    const chain = this.links(requested);
    const budgetMs =
      budgetOverrideMs ?? this.options.budgetMs ?? DEFAULT_CHAIN_BUDGET_MS;
    const startedAt = Date.now();
    let lastSkipped: unknown;

    for (const [index, modelId] of chain.entries()) {
      // Ngân sách chặn cả CHUỖI, không chỉ từng mắt xích: mỗi `attempt` nhận một `AbortSignal.timeout` MỚI. Mắt đầu luôn được chạy trọn hạn của nó.
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
        const unavailable = error instanceof ModelUnavailableError;
        const retired = isModelRetired(error);
        const limited = isRateLimited(error);
        const denied = isAccessDenied(error);
        const sick = isTransientUpstream(error);
        if (!unavailable && !limited && !retired && !denied && !sick) {
          throw error;
        }

        lastSkipped = error;
        const reason = unavailable
          ? error.message
          : retired
            ? 'gateway đã rút model này'
            : limited
              ? 'hết hạn mức'
              : denied
                ? 'lõi từ chối khoá hoặc model này'
                : 'lõi trả 5xx';
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
