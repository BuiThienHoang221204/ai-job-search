import {
  estimateTokens,
  markUsed,
  pickStart,
} from 'src/modules/ai/utils/fast-model-scheduler.js';

describe('fast-model-scheduler — kind=count (UnoRouter: 1 lượt/phút/model)', () => {
  test('chưa dùng bao giờ thì còn chỗ', () => {
    expect(
      pickStart(['unorouter/model-chua-dung-bao-gio:free'], 100, 'omniroute'),
    ).toBe('unorouter/model-chua-dung-bao-gio:free');
  });

  test('vừa dùng xong thì hết chỗ, candidate kế tiếp được chọn', () => {
    const now = Date.now();
    markUsed('unorouter/da-dung:free', 100, now);
    expect(
      pickStart(
        ['unorouter/da-dung:free', 'unorouter/con-ranh:free'],
        100,
        'omniroute',
        now + 1000,
      ),
    ).toBe('unorouter/con-ranh:free');
  });

  test('qua đủ windowMs (60s) thì lại còn chỗ', () => {
    const now = Date.now();
    markUsed('unorouter/nghi-du:free', 100, now);
    expect(
      pickStart(['unorouter/nghi-du:free'], 100, 'omniroute', now + 60_001),
    ).toBe('unorouter/nghi-du:free');
  });
});

describe('fast-model-scheduler — kind=count, limit > 1 (Gemini: RPM 15, không phải "1 lượt/window")', () => {
  test('còn chỗ cho tới khi đủ limit lượt trong window', () => {
    const now = Date.now();
    const key = 'gemini/models/gemini-3.5-flash-lite';
    for (let i = 0; i < 14; i += 1) markUsed(key, 100, now + i);
    // 14 lượt đã dùng, limit 15 → vẫn còn 1 chỗ.
    expect(pickStart([key], 100, 'omniroute', now + 14)).toBe(key);
  });

  test('hết chỗ đúng lúc chạm limit, không phải sau lượt đầu tiên', () => {
    const now = Date.now();
    const key = 'gemini/models/gemini-3.5-flash-lite';
    for (let i = 0; i < 15; i += 1) markUsed(key, 100, now + i);
    expect(pickStart([key], 100, 'omniroute', now + 15)).toBeUndefined();
  });
});

describe('fast-model-scheduler — nhiều trần cùng lúc (Gemini: RPM 5 VÀ RPD 20, phải thoả CẢ HAI)', () => {
  test('RPD cạn thì hết chỗ dù RPM còn dư (các lượt cách nhau >60s để không chạm RPM)', () => {
    const now = Date.now();
    const key = 'gemini/models/gemini-3-flash-preview';
    for (let i = 0; i < 20; i += 1) markUsed(key, 100, now + i * 61_000);
    expect(
      pickStart([key], 100, 'omniroute', now + 20 * 61_000),
    ).toBeUndefined();
  });

  test('RPM cạn thì hết chỗ dù RPD còn dư nhiều (5 lượt dồn trong 1 phút, RPD mới 5/20)', () => {
    const now = Date.now();
    const key = 'gemini/models/gemini-robotics-er-2-preview';
    for (let i = 0; i < 5; i += 1) markUsed(key, 100, now + i);
    expect(pickStart([key], 100, 'omniroute', now + 5)).toBeUndefined();
  });
});

describe('fast-model-scheduler — kind=token (Groq: TPM là trần thật)', () => {
  test('còn chỗ khi tổng token trong window + ước lượng mới ≤ limit', () => {
    const now = Date.now();
    markUsed('groq/openai/gpt-oss-20b', 3000, now);
    expect(
      pickStart(['groq/openai/gpt-oss-20b'], 3000, 'omniroute', now + 1000),
    ).toBe('groq/openai/gpt-oss-20b');
  });

  test('hết chỗ khi vượt TPM (gpt-oss-safeguard-20b chỉ 2.000 TPM)', () => {
    const now = Date.now();
    markUsed('groq/openai/gpt-oss-safeguard-20b', 1800, now);
    expect(
      pickStart(
        ['groq/openai/gpt-oss-safeguard-20b', 'groq/openai/gpt-oss-20b'],
        500,
        'omniroute',
        now + 1000,
      ),
    ).toBe('groq/openai/gpt-oss-20b');
  });

  test('token cũ hơn window bị dọn, không tính vào tổng', () => {
    const now = Date.now();
    markUsed('groq/qwen/qwen3.8-27b', 7000, now);
    expect(
      pickStart(['groq/qwen/qwen3.8-27b'], 7000, 'omniroute', now + 60_001),
    ).toBe('groq/qwen/qwen3.8-27b');
  });
});

describe('fast-model-scheduler — lõi không khai rateLimitFor', () => {
  test('luôn coi là còn chỗ, bất kể dùng bao nhiêu lần', () => {
    const now = Date.now();
    markUsed('openrouter/qwen/qwen3.8-27b:free', 999_999, now);
    expect(
      pickStart(
        ['openrouter/qwen/qwen3.8-27b:free'],
        999_999,
        'omniroute',
        now + 1,
      ),
    ).toBe('openrouter/qwen/qwen3.8-27b:free');
  });
});

describe('pickStart — không candidate nào còn chỗ', () => {
  test('trả undefined, để người gọi dùng lại mắt xích mặc định và để ModelChain domino', () => {
    const now = Date.now();
    markUsed('unorouter/het-cho-1:free', 100, now);
    markUsed('unorouter/het-cho-2:free', 100, now);
    expect(
      pickStart(
        ['unorouter/het-cho-1:free', 'unorouter/het-cho-2:free'],
        100,
        'omniroute',
        now + 1000,
      ),
    ).toBeUndefined();
  });
});

describe('estimateTokens', () => {
  test('ước lượng thô ~4 ký tự/token', () => {
    expect(estimateTokens('a'.repeat(400), 'b'.repeat(400))).toBe(200);
  });
});
