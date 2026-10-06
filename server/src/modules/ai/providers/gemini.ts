import { DAY_MS, MINUTE_MS } from '@/common/duration';
import type { ProviderDescriptor, RateLimitSpec } from './types';

const perMinuteAndDay = (rpm: number, rpd: number): RateLimitSpec[] => [
  { kind: 'count', windowMs: MINUTE_MS, limit: rpm },
  { kind: 'count', windowMs: DAY_MS, limit: rpd },
];

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

export const gemini: ProviderDescriptor = {
  id: 'gemini',
  label: 'Gemini API',
  apiKeyEnv: 'GOOGLE_GEMINI_API_KEY',
  baseURLEnv: 'GOOGLE_GEMINI_BASE_URL',
  rateLimitFor: (modelId) => LIMITS.get(modelId),
};
