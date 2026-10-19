import {
  isProbeCandidate,
  rankModels,
  type ModelHealth,
} from 'src/modules/ai/utils/model-pool.js';

const probed = (modelId: string, healthy: boolean, latencyMs: number) =>
  ({
    modelId,
    healthy,
    latencyMs,
    lastCheckedAt: 1,
    consecutiveFailures: 0,
  }) satisfies ModelHealth;

describe('isProbeCandidate', () => {
  test('bỏ model không phải chat, giữ model chat', () => {
    expect(isProbeCandidate('groq/whisper-large-v3')).toBe(false);
    expect(isProbeCandidate('gemini/text-embedding-004')).toBe(false);
    expect(isProbeCandidate('opencode/beam-free')).toBe(false);
    expect(isProbeCandidate('groq/qwen/qwen3.8-27b')).toBe(true);
  });

  test('lõi trả phí chỉ lấy bản free', () => {
    expect(isProbeCandidate('openrouter/qwen/qwen3-coder')).toBe(false);
    expect(isProbeCandidate('openrouter/qwen/qwen3-coder:free')).toBe(true);
  });
});

describe('rankModels', () => {
  const providers = ['opencode', 'omniroute'];

  test('model trượt probe xuống cuối, seed đứng trước model quét được, rồi theo lõi và độ trễ', () => {
    const seeds = ['omniroute/auto/fast', 'opencode/slow', 'opencode/dead'];
    const health = new Map([
      ['opencode/slow', probed('opencode/slow', true, 900)],
      ['opencode/dead', probed('opencode/dead', false, 0)],
      ['omniroute/auto/fast', probed('omniroute/auto/fast', true, 100)],
      ['opencode/new-fast', probed('opencode/new-fast', true, 50)],
    ]);

    expect(
      rankModels([...seeds, 'opencode/new-fast'], providers, seeds, health),
    ).toEqual([
      'opencode/slow',
      'omniroute/auto/fast',
      'opencode/new-fast',
      'opencode/dead',
    ]);
  });

  test('chưa probe thì giữ nguyên thứ tự .env trong cùng lõi', () => {
    const seeds = ['opencode/a', 'opencode/b'];
    expect(rankModels(seeds, providers, seeds, new Map())).toEqual(seeds);
  });
});
