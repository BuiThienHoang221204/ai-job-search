import type { Logger } from '@nestjs/common';
import {
  classifyFailure,
  isAccessDenied,
  isModelRetired,
  isRateLimited,
  isTransientUpstream,
} from '../utils/failure-kind';
import { formatModelRef, parseModelRef } from '../utils/model-ref';
import { providerIds } from '../providers/index';
import { ModelUnavailableError } from '../utils/failure-kind';

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

  /** So trùng theo dạng ĐẦY ĐỦ, nếu không thì `x` và `opencode/x` thành hai mắt xích và model vừa hết hạn mức được thử lại ngay. `fallbackOverride` thay hẳn `MODEL_FALLBACK_IDS` cho một lượt gọi — dùng khi lượt đó cần một chuỗi RIÊNG (vd. chỉ toàn model nhanh). */
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

  /** Đi tiếp trong đúng BẢY trường hợp, cả bảy nghĩa là "mắt xích này không dùng được" — kể cả TIMEOUT và SCHEMA (chốt 2026-10-05, đổi từ "ném ngay": batch job.requirements đo thật cho thấy 2 loại này chiếm phần lớn lỗi mà trước đó không hề thử mắt xích nào khác). */
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
        const kind = classifyFailure(error);
        const timedOut = kind === 'TIMEOUT';
        const badSchema = kind === 'SCHEMA';
        if (
          !unavailable &&
          !limited &&
          !retired &&
          !denied &&
          !sick &&
          !timedOut &&
          !badSchema
        ) {
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
                : sick
                  ? 'lõi trả 5xx'
                  : timedOut
                    ? 'mắt xích chậm, vượt timeout'
                    : 'model trả sai định dạng';
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
