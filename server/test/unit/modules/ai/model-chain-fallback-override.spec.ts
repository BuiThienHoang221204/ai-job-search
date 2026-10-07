import { Logger } from '@nestjs/common';
import { ModelChain } from 'src/modules/ai/services/model-chain.js';

const denied = (status: number) =>
  Object.assign(new Error(`[${status}]: lõi từ chối`), {
    name: 'AI_APICallError',
    statusCode: status,
  });

const chainOf = (fallbackModelIds: string[]) =>
  new ModelChain({
    defaultModelId: 'opencode/a',
    defaultProviderId: 'opencode',
    fallbackModelIds,
    logger: { warn: jest.fn(), log: jest.fn() } as unknown as Logger,
  });

/** `fallbackOverride` cho một lượt gọi RIÊNG một chuỗi, không đụng `MODEL_FALLBACK_IDS` chung — dùng cho tác vụ cần một nhóm model khác hẳn (vd. chỉ toàn model nhanh). */
describe('ModelChain — chuỗi dự phòng riêng cho một lượt gọi', () => {
  test('không truyền override thì dùng đúng MODEL_FALLBACK_IDS như cũ', () => {
    const chain = chainOf(['opencode/b', 'opencode/c']);
    expect(chain.links('groq/a')).toEqual([
      'groq/a',
      'opencode/b',
      'opencode/c',
    ]);
  });

  test('truyền override thì THAY HẲN, không cộng dồn với MODEL_FALLBACK_IDS', () => {
    const chain = chainOf(['opencode/b', 'opencode/c']);
    expect(chain.links('groq/a', ['groq/d', 'groq/e'])).toEqual([
      'groq/a',
      'groq/d',
      'groq/e',
    ]);
  });

  test('mảng rỗng thì chỉ còn mắt xích đầu, không lùi về chuỗi chung', () => {
    const chain = chainOf(['opencode/b', 'opencode/c']);
    expect(chain.links('groq/a', [])).toEqual(['groq/a']);
  });

  test('run() thử đúng chuỗi override khi mắt xích đầu hỏng', async () => {
    const attempt = jest
      .fn<Promise<string>, [string | undefined]>()
      .mockRejectedValueOnce(denied(403))
      .mockResolvedValueOnce('xong bằng model nhanh dự phòng');

    const result = await chainOf(['opencode/cham']).run(
      'groq/a',
      attempt,
      undefined,
      ['groq/b'],
    );

    expect(result).toBe('xong bằng model nhanh dự phòng');
    expect(attempt.mock.calls.map((call) => call[0])).toEqual([
      'groq/a',
      'groq/b',
    ]);
  });

  test('Groq trả 413 vì prompt vượt TPM thì đi tiếp mắt xích sau, không ném luôn', async () => {
    const tooLarge = Object.assign(
      new Error(
        'Request too large for model `openai/gpt-oss-120b`: Limit 8000, Requested 9873',
      ),
      { name: 'AI_APICallError', statusCode: 413 },
    );
    const attempt = jest
      .fn<Promise<string>, [string | undefined]>()
      .mockRejectedValueOnce(tooLarge)
      .mockResolvedValueOnce('xong bằng model trần token lớn hơn');

    const result = await chainOf(['opencode/cham']).run(
      'groq/openai/gpt-oss-120b',
      attempt,
      undefined,
      ['gemini/models/gemini-3.5-flash-lite'],
    );

    expect(result).toBe('xong bằng model trần token lớn hơn');
    expect(attempt.mock.calls.map((call) => call[0])).toEqual([
      'groq/openai/gpt-oss-120b',
      'gemini/models/gemini-3.5-flash-lite',
    ]);
  });

  test('trùng mắt xích đầu thì bỏ, giống hành vi của MODEL_FALLBACK_IDS', () => {
    const chain = chainOf([]);
    expect(chain.links('groq/a', ['groq/a', 'groq/b'])).toEqual([
      'groq/a',
      'groq/b',
    ]);
  });
});
