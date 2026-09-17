import { Logger } from '@nestjs/common';
import { ModelChain } from 'src/modules/ai/services/model-chain.js';

const denied = (status: number) =>
  Object.assign(new Error(`[${status}]: lõi từ chối`), {
    name: 'AI_APICallError',
    statusCode: status,
  });

const chainOf = (fallbackModelIds: string[], budgetMs?: number) =>
  new ModelChain({
    defaultModelId: 'opencode/a',
    defaultProviderId: 'opencode',
    fallbackModelIds,
    budgetMs,
    logger: { warn: jest.fn(), log: jest.fn() } as unknown as Logger,
  });

describe('ngân sách thời gian của cả chuỗi', () => {
  test('mắt xích đầu luôn được chạy trọn, kể cả khi ngân sách bằng 0', async () => {
    const attempt = jest.fn<Promise<string>, [string | undefined]>();
    attempt.mockResolvedValueOnce('xong');

    const result = await chainOf(['opencode/b'], 0).run('opencode/a', attempt);

    expect(result).toBe('xong');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  test('vượt ngân sách thì KHÔNG thử mắt xích kế, và ném lỗi cuối cùng', async () => {
    const boom = denied(403);
    const attempt = jest
      .fn<Promise<string>, [string | undefined]>()
      .mockRejectedValue(boom);

    await expect(
      chainOf(['opencode/b', 'opencode/c'], 0).run('opencode/a', attempt),
    ).rejects.toBe(boom);

    expect(attempt).toHaveBeenCalledTimes(1);
  });

  test('còn ngân sách thì đi hết chuỗi như cũ', async () => {
    const attempt = jest
      .fn<Promise<string>, [string | undefined]>()
      .mockRejectedValueOnce(denied(403))
      .mockRejectedValueOnce(denied(401))
      .mockResolvedValueOnce('xong');

    const result = await chainOf(['opencode/b', 'opencode/c'], 60_000).run(
      'opencode/a',
      attempt,
    );

    expect(result).toBe('xong');
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  test('tham số budgetOverrideMs thắng ngân sách chung', async () => {
    const boom = denied(403);
    const attempt = jest
      .fn<Promise<string>, [string | undefined]>()
      .mockRejectedValue(boom);

    await expect(
      chainOf(['opencode/b'], 60_000).run('opencode/a', attempt, 0),
    ).rejects.toBe(boom);

    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
