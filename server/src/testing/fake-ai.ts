import type {
  Ai,
  GenerateObjectOptions,
} from '../modules/ai/services/ai.service.js';

/**
 * Kết quả xếp sẵn cho một lần gọi: hoặc object mà model "trả về", hoặc lỗi để
 * thử nhánh thất bại.
 */
type Scripted = { object: unknown } | { error: Error };

export const FAKE_MODEL_ID = 'fake-model';

/** Bản giả của `AiService` cho test: không mạng, không tiền, không chờ. */
export class FakeAi implements Ai {
  /**
   * Nhật ký mọi lần gọi, để test khẳng định được "đã gọi đúng tác vụ với đúng
   * prompt" chứ không chỉ "có gọi".
   */
  readonly calls: Array<{
    purpose: string;
    userId?: string;
    system: string;
    prompt: string;
    modelId?: string;
  }> = [];

  private readonly scripted: Scripted[] = [];

  /** Xếp sẵn các object sẽ trả về, theo đúng thứ tự sẽ được gọi. */
  willReturn(...objects: unknown[]): this {
    for (const object of objects) this.scripted.push({ object });
    return this;
  }

  /** Xếp sẵn một lần gọi thất bại. */
  willFail(error: Error): this {
    this.scripted.push({ error });
    return this;
  }

  /**
   * Còn bao nhiêu kết quả chưa dùng. Test nên khẳng định về 0 ở cuối: còn dư
   * nghĩa là một nhánh đã không chạy như tưởng.
   */
  get pending(): number {
    return this.scripted.length;
  }

  /** Xoá nhật ký và các kết quả chưa dùng. */
  reset(): void {
    this.calls.length = 0;
    this.scripted.length = 0;
  }

  async generateObject<T>(
    options: GenerateObjectOptions<T>,
  ): Promise<{ object: T; modelId: string }> {
    await Promise.resolve();

    this.calls.push({
      purpose: options.context.purpose,
      userId: options.context.userId,
      system: options.system,
      prompt: options.prompt,
      modelId: options.modelId,
    });

    const next = this.scripted.shift();
    if (!next) {
      throw new Error(
        `FakeAi: lần gọi thứ ${this.calls.length} (${options.context.purpose}) không có kết quả xếp sẵn. ` +
          'Gọi willReturn()/willFail() trước, hoặc đây là một lần gọi model ngoài dự tính.',
      );
    }
    if ('error' in next) throw next.error;

    return {
      object: options.schema.parse(next.object),
      modelId: FAKE_MODEL_ID,
    };
  }
}
