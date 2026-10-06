import type {
  Ai,
  GenerateObjectOptions,
  StreamObjectOptions,
  StreamObjectResult,
  StreamTextOptions,
  StreamTextResult,
} from '../modules/ai/ai.types';

type Scripted = { object: unknown } | { error: Error };

export const FAKE_MODEL_ID = 'fake-model';

export class FakeAi implements Ai {
  readonly calls: Array<{
    purpose: string;
    userId?: string;
    system: string;
    prompt: string;
    modelId?: string;
  }> = [];

  private readonly scripted: Scripted[] = [];

  willReturn(...objects: unknown[]): this {
    for (const object of objects) this.scripted.push({ object });
    return this;
  }

  willFail(error: Error): this {
    this.scripted.push({ error });
    return this;
  }

  get pending(): number {
    return this.scripted.length;
  }

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

  streamText(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: StreamTextOptions,
  ): Promise<{ modelId: string; result: StreamTextResult }> {
    throw new Error('FakeAi.streamText chưa được mock cho test này');
  }

  streamObject<T>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: StreamObjectOptions<T>,
  ): Promise<StreamObjectResult<T>> {
    throw new Error('FakeAi.streamObject chưa được mock cho test này');
  }
}
