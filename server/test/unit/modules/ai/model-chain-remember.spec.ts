import { Logger } from '@nestjs/common';
import {
  ModelChain,
  type ModelHealthTracker,
} from 'src/modules/ai/services/model-chain.js';

const POOL = ['omniroute/a', 'omniroute/b', 'omniroute/c'];

const rateLimit = () =>
  Object.assign(new Error('[429]: Too many requests'), { statusCode: 429 });

const chainWith = (pool: string[] = POOL) => {
  const tracker: ModelHealthTracker = {
    mainChain: () => pool,
    isCoolingDown: () => false,
    recordSuccess: () => undefined,
    recordFailure: () => undefined,
  };
  return new ModelChain({
    defaultModelId: '',
    defaultProviderId: 'omniroute',
    fallbackModelIds: [],
    budgetMs: 240_000,
    logger: { warn: jest.fn(), log: jest.fn() } as unknown as Logger,
    pool: tracker,
  });
};

const tried = (attempt: jest.Mock<Promise<string>, [string | undefined]>) =>
  attempt.mock.calls.map((call) => call[0]);

describe('ModelChain — nhớ model vừa chạy được theo tác vụ', () => {
  afterEach(() => jest.useRealTimers());

  test('lần sau của cùng tác vụ bắt đầu từ model vừa chạy được, tác vụ khác thì không', async () => {
    const chain = chainWith();
    await chain.run(
      undefined,
      jest
        .fn<Promise<string>, [string | undefined]>()
        .mockRejectedValueOnce(rateLimit())
        .mockResolvedValueOnce('ok'),
      undefined,
      'profile.synthesize',
    );

    expect(chain.links(undefined, undefined, 'profile.synthesize')[0]).toBe(
      'omniroute/b',
    );
    expect(chain.links(undefined, undefined, 'job.requirements')[0]).toBe(
      'omniroute/a',
    );
  });

  test('caller chỉ định model thì không dùng và không ghi trí nhớ', async () => {
    const chain = chainWith();
    await chain.run(
      'omniroute/c',
      jest.fn<Promise<string>, [string | undefined]>().mockResolvedValue('ok'),
      undefined,
      'match.evaluate',
    );

    expect(chain.links(undefined, undefined, 'match.evaluate')[0]).toBe(
      'omniroute/a',
    );
  });

  test('model nhớ hỏng thì quên ngay, lượt sau quay về đầu bể', async () => {
    const chain = chainWith();
    const purpose = 'profile.synthesize';
    await chain.run(
      undefined,
      jest
        .fn<Promise<string>, [string | undefined]>()
        .mockRejectedValueOnce(rateLimit())
        .mockResolvedValueOnce('ok'),
      undefined,
      purpose,
    );
    const failing = jest
      .fn<Promise<string>, [string | undefined]>()
      .mockRejectedValue(rateLimit());

    await expect(
      chain.run(undefined, failing, undefined, purpose),
    ).rejects.toThrow('429');

    expect(tried(failing)[0]).toBe('omniroute/b');
    expect(chain.links(undefined, undefined, purpose)[0]).toBe('omniroute/a');
  });

  test('trí nhớ hết hạn sau 30 phút và bị bỏ khi model không còn trong bể', async () => {
    jest.useFakeTimers({ now: 0 });
    const pool = [...POOL];
    const chain = chainWith(pool);
    await chain.run(
      undefined,
      jest
        .fn<Promise<string>, [string | undefined]>()
        .mockRejectedValueOnce(rateLimit())
        .mockResolvedValueOnce('ok'),
      undefined,
      'job.requirements',
    );

    pool.splice(1, 1);
    expect(chain.links(undefined, undefined, 'job.requirements')[0]).toBe(
      'omniroute/a',
    );

    pool.splice(1, 0, 'omniroute/b');
    jest.setSystemTime(31 * 60_000);
    expect(chain.links(undefined, undefined, 'job.requirements')[0]).toBe(
      'omniroute/a',
    );
  });
});
