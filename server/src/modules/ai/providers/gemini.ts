import { DAY_MS, MINUTE_MS } from '@/common/duration';
import type { ProviderDescriptor, RateLimitSpec } from './types';

const perMinuteAndDay = (rpm: number, rpd: number): RateLimitSpec[] => [
  { kind: 'count', windowMs: MINUTE_MS, limit: rpm },
  { kind: 'count', windowMs: DAY_MS, limit: rpd },
];

/** Catalog trả id có tiền tố `models/`, phải giữ nguyên khi so khớp. */
const LIMIT_GROUPS: [string[], RateLimitSpec[]][] = [
  [
    ['models/gemini-3.5-flash-lite', 'models/gemini-3.1-flash-lite'],
    perMinuteAndDay(15, 500),
  ],
  [
    [
      'models/gemini-3.6-flash',
      'models/gemini-3.7-flash',
      'models/gemini-3.8-flash',
      'models/gemini-3-flash',
      'models/gemini-3-flash-preview',
      'models/gemini-3.5-flash',
      'models/gemini-2.5-flash',
      'models/gemini-robotics-er-2-preview',
    ],
    perMinuteAndDay(5, 20),
  ],
  [['models/gemini-2.5-flash-lite'], perMinuteAndDay(10, 20)],
  [
    ['models/gemma-4-26b-a4b-it', 'models/gemma-4-31b-it'],
    perMinuteAndDay(30, 14_400),
  ],
];

const LIMITS = new Map(
  LIMIT_GROUPS.flatMap(([ids, specs]) => ids.map((id) => [id, specs] as const)),
);

/** Không có trong catalog models.opencode.ai, không cần thẻ thanh toán để lấy key (đo 2026-10-05, khác Cerebras). */
export const gemini: ProviderDescriptor = {
  id: 'gemini',
  label: 'Gemini API',
  apiKeyEnv: 'GOOGLE_GEMINI_API_KEY',
  baseURLEnv: 'GOOGLE_GEMINI_BASE_URL',

  /** RPM + RPD thật từ aistudio.google.com/rate-limit của tài khoản 2026-10-05, cả hai cùng áp dụng; KHÔNG lấy từ trang pricing công khai, TPM 250.000 quá lớn nên không theo dõi. */
  rateLimitFor: (modelId) => LIMITS.get(modelId),
};
