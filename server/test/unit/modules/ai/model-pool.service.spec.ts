import type { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ModelChain } from 'src/modules/ai/services/model-chain.js';
import { ModelPoolService } from 'src/modules/ai/services/model-pool.service.js';

const CONFIG: Record<string, unknown> = {
  'ai.provider': 'omniroute',
  'ai.modelId': 'opencode/a',
  'ai.fallbackModelIds': ['opencode/b', 'auto/fast'],
  'ai.fastModelId': '',
  'ai.fastFallbackModelIds': [],
  'ai.mainProviders': ['opencode', 'omniroute'],
  'ai.fastProviders': ['groq'],
  'ai.healthcheck.circuitBreakerThreshold': 2,
  'ai.healthcheck.circuitBreakerCooldownMs': 60_000,
};

const timeout = () =>
  Object.assign(new Error('The operation was aborted due to timeout'), {
    name: 'TimeoutError',
  });

const tooLarge = () =>
  Object.assign(new Error('Request too large'), {
    name: 'AI_APICallError',
    statusCode: 413,
  });

function setup(overrides: Record<string, unknown> = {}) {
  const config = {
    get: (key: string) => (key in overrides ? overrides[key] : CONFIG[key]),
  } as unknown as ConfigService;
  const pool = new ModelPoolService(config);
  const chain = new ModelChain({
    defaultModelId: 'opencode/a',
    defaultProviderId: 'omniroute',
    fallbackModelIds: [],
    logger: { warn: jest.fn(), log: jest.fn() } as unknown as Logger,
    pool,
  });
  return { pool, chain };
}

async function runFailingOn(
  chain: ModelChain,
  dead: string,
  error: () => Error,
): Promise<string[]> {
  const tried: string[] = [];
  await chain.run(undefined, (modelId) => {
    tried.push(modelId ?? '');
    return modelId === dead ? Promise.reject(error()) : Promise.resolve('ok');
  });
  return tried;
}

describe('ModelPoolService + ModelChain — cầu dao', () => {
  test('so trùng theo lõi/model: auto/fast và omniroute/auto/fast là một mắt xích', () => {
    const { chain } = setup();
    expect(chain.links()).toEqual([
      'opencode/a',
      'opencode/b',
      'omniroute/auto/fast',
    ]);
  });

  test('timeout 2 lần liên tiếp thì cách ly: lượt sau không thử model đó nữa', async () => {
    const { pool, chain } = setup();

    expect(await runFailingOn(chain, 'opencode/a', timeout)).toEqual([
      'opencode/a',
      'opencode/b',
    ]);
    await runFailingOn(chain, 'opencode/a', timeout);

    expect(pool.isCoolingDown('opencode/a')).toBe(true);
    expect(await runFailingOn(chain, 'opencode/a', timeout)).toEqual([
      'opencode/b',
    ]);
  });

  test('model bị cách ly vẫn bị bỏ khi caller chỉ định nó, trừ khi cả chuỗi đều bị cách ly', () => {
    const { pool, chain } = setup();
    for (const id of ['opencode/a', 'opencode/a']) {
      pool.recordFailure(id, 'hết hạn mức');
    }

    expect(chain.links('opencode/a', ['opencode/b'])).toEqual(['opencode/b']);
    expect(chain.links('opencode/a', [])).toEqual(['opencode/a']);
  });

  test('gọi thành công thì mở cầu dao và đặt lại bộ đếm', async () => {
    const { pool, chain } = setup();
    pool.recordFailure('opencode/a', 'lõi trả 5xx');
    pool.recordFailure('opencode/a', 'lõi trả 5xx');

    await chain.run('opencode/a', () => Promise.resolve('ok'), []);

    expect(pool.isCoolingDown('opencode/a')).toBe(false);
    expect(pool.status().models[0].consecutiveFailures).toBe(0);
  });

  test('prompt vượt trần token là lỗi của tác vụ, không cộng vào cầu dao', async () => {
    const { pool, chain } = setup();
    await runFailingOn(chain, 'opencode/a', tooLarge);
    await runFailingOn(chain, 'opencode/a', tooLarge);

    expect(pool.isCoolingDown('opencode/a')).toBe(false);
  });

  test('không khai model nào thì cả hai bể lấy từ model quét được, xếp theo độ trễ probe', () => {
    const { pool, chain } = setup({
      'ai.modelId': '',
      'ai.fallbackModelIds': [],
    });
    pool.setDiscovered(
      ['opencode/slow', 'opencode/fast'],
      ['groq/qwen', 'groq/oss'],
    );
    pool.recordProbe('opencode/slow', true, 900);
    pool.recordProbe('opencode/fast', true, 200);
    pool.recordProbe('groq/qwen', false, 0, '429');
    pool.recordProbe('groq/oss', true, 300);

    expect(chain.links()).toEqual(['opencode/fast', 'opencode/slow']);
    expect(pool.fastChain()).toEqual(['groq/oss', 'groq/qwen']);
  });

  test('lượt quét mới xoá tình trạng của model không còn trong bể nào', () => {
    const { pool } = setup({ 'ai.modelId': '', 'ai.fallbackModelIds': [] });
    pool.setDiscovered(['opencode/retired', 'opencode/kept'], []);
    pool.recordProbe('opencode/retired', false, 0, '404');
    pool.recordProbe('opencode/kept', true, 300);

    pool.setDiscovered(['opencode/kept'], []);

    expect(pool.status().models.map((m) => m.modelId)).toEqual([
      'opencode/kept',
    ]);
  });
});
