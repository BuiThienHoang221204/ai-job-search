import { Logger } from '@nestjs/common';
import { ModelChain } from 'src/modules/ai/services/model-chain.js';

const HEDGE_MS = 20;

const chainOf = () =>
  new ModelChain({
    defaultModelId: 'omniroute/a',
    defaultProviderId: 'omniroute',
    fallbackModelIds: ['omniroute/b'],
    budgetMs: 240_000,
    logger: { warn: jest.fn(), log: jest.fn() } as unknown as Logger,
  });

const after = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/** Lượt gọi treo tới khi bị huỷ, rồi ném lỗi huỷ như SDK thật. */
const hangUntilAborted = (signal: AbortSignal) =>
  new Promise<string>((_, reject) => {
    signal.addEventListener('abort', () =>
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
  });

describe('ModelChain — gọi song song khi mắt đầu chậm', () => {
  test('mắt đầu chậm quá mốc thì chạy song song mắt sau, mắt sau thắng thì huỷ mắt đầu', async () => {
    const signals: AbortSignal[] = [];
    const attempt = jest.fn(
      (modelId: string | undefined, _isLast: boolean, signal: AbortSignal) => {
        signals.push(signal);
        if (modelId === 'omniroute/a') return hangUntilAborted(signal);
        return Promise.resolve(`xong bằng ${modelId}`);
      },
    );

    const result = await chainOf().run(
      undefined,
      attempt,
      undefined,
      undefined,
      HEDGE_MS,
    );

    expect(result).toBe('xong bằng omniroute/b');
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  test('mắt đầu xong trước mốc thì không gọi mắt sau', async () => {
    const attempt = jest.fn((modelId: string | undefined) =>
      Promise.resolve(`xong bằng ${modelId}`),
    );

    await chainOf().run(undefined, attempt, undefined, undefined, HEDGE_MS);
    await after(HEDGE_MS * 2, null);

    expect(attempt).toHaveBeenCalledTimes(1);
  });

  test('mắt đầu hỏng sớm thì đi tiếp mắt sau ngay, không chờ tới mốc', async () => {
    const startedAt = Date.now();
    const attempt = jest
      .fn<Promise<string>, [string | undefined, boolean, AbortSignal]>()
      .mockRejectedValueOnce(
        Object.assign(new Error('[429]'), { statusCode: 429 }),
      )
      .mockResolvedValueOnce('xong');

    await chainOf().run(undefined, attempt, undefined, undefined, 1_000);

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});
