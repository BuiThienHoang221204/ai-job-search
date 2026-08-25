import type { Logger } from '@nestjs/common';
import {
  isModelRetired,
  isRateLimited,
  isTransientUpstream,
} from '../failure-kind.js';
import { formatModelRef, parseModelRef } from '../model-ref.js';
import { providerIds } from '../providers/index.js';
import { ModelUnavailableError } from './model-catalog.service.js';

/**
 * Mắt xích đang thử đã tốn bước agent nào chưa.
 *
 * Đây là phanh cho một cái giá không thấy được từ `run()`: đổi model nghĩa là
 * gọi lại `attempt` từ đầu, mà `runTools` chạy lại là chạy lại TỪ BƯỚC 0. Bỏ
 * mắt xích sau bước thứ chín là trả tiền lần hai cho chín bước đã xong, và
 * nhánh FAILED của `AgentRunnerService` không lưu `messages` nên cũng không có
 * đường chạy tiếp. Một lượt CHƯA đi được bước nào thì không mất gì cả.
 *
 * `generateObject` là một lượt hỏi-đáp, không bao giờ chạm vào cờ này.
 */
export type ChainProgress = { spent: boolean };

export type ModelChainOptions = {
  defaultModelId: string;
  defaultProviderId: string;
  fallbackModelIds: string[];
  /**
   * Logger của `AiService`, KHÔNG phải logger riêng: dòng "Bỏ qua ..." đã nằm
   * trong nhật ký production dưới tên đó.
   */
  logger: Logger;
};

/**
 * Thứ tự model sẽ thử cho một lời gọi, và luật quyết định khi nào đi tiếp.
 *
 * Tách khỏi `AiService` vì đây là phần CHÍNH SÁCH: nó không biết gì về SDK,
 * prisma hay schema, chỉ trả lời đúng một câu hỏi - lỗi này là "mắt xích này
 * không dùng được" hay "tác vụ này hỏng". Cả hai đường gọi model dùng chung
 * một bản, nên hai đường không thể lệch nhau về ý nghĩa của "bỏ qua".
 */
export class ModelChain {
  constructor(private readonly options: ModelChainOptions) {}

  /** Dạng đầy đủ `lõi/model`, để so trùng không phụ thuộc cách viết tắt. */
  private canonical(ref: string): string {
    return formatModelRef(
      parseModelRef(ref, providerIds(), this.options.defaultProviderId),
    );
  }

  /**
   * Thứ tự mắt xích sẽ thử cho MỘT lời gọi. So trùng theo dạng đầy đủ, nếu
   * không thì `deepseek-v4-flash-free` và `opencode/deepseek-v4-flash-free`
   * thành hai mắt xích và model vừa hết hạn mức sẽ được thử lại ngay lập tức.
   */
  links(requested?: string): Array<string | undefined> {
    // Giữ `undefined` khi không cấu hình model mặc định, để catalog dùng mặc
    // định của chính nó thay vì đi hỏi một model tên rỗng.
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

  /**
   * Chạy `attempt` lần lượt trên chuỗi model cho tới khi có cái chạy được.
   *
   * Chuỗi đi tiếp trong đúng BỐN trường hợp, và cả bốn đều là "mắt xích này
   * không dùng được" chứ không phải "tác vụ này hỏng": hết hạn mức, model
   * không khả dụng, gateway đã rút model, hoặc lõi trả 5xx lúc chưa đi được
   * bước nào. Mọi lỗi khác ném ra ngay - đặc biệt là lỗi schema, vì đổi model
   * khi model trả sai định dạng sẽ giấu mất tín hiệu "model này quá yếu".
   */
  async run<T>(
    requested: string | undefined,
    attempt: (
      modelId: string | undefined,
      progress: ChainProgress,
    ) => Promise<T>,
  ): Promise<T> {
    const chain = this.links(requested);
    let lastSkipped: unknown;

    for (const [index, modelId] of chain.entries()) {
      const progress: ChainProgress = { spent: false };
      try {
        return await attempt(modelId, progress);
      } catch (error) {
        const unavailable = error instanceof ModelUnavailableError;
        const retired = isModelRetired(error);
        const limited = isRateLimited(error);
        const sick = isTransientUpstream(error) && !progress.spent;
        if (!unavailable && !limited && !retired && !sick) throw error;

        lastSkipped = error;
        const reason = unavailable
          ? error.message
          : retired
            ? 'gateway đã rút model này'
            : limited
              ? 'hết hạn mức'
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
