import { DAY_MS, MINUTE_MS } from '@/common/duration';
import type { ProviderDescriptor, RateLimitSpec } from './types';

const STANDARD: RateLimitSpec[] = [
  { kind: 'token', windowMs: MINUTE_MS, limit: 8000 },
  { kind: 'token', windowMs: DAY_MS, limit: 200_000 },
  { kind: 'count', windowMs: DAY_MS, limit: 1000 },
];

const LIMITS = new Map<string, RateLimitSpec[]>([
  [
    'openai/gpt-oss-safeguard-20b',
    [{ kind: 'token', windowMs: MINUTE_MS, limit: 2000 }],
  ],
  ['openai/gpt-oss-120b', STANDARD],
  ['openai/gpt-oss-20b', STANDARD],
  ['qwen/qwen3.8-27b', STANDARD],
]);

export const groq: ProviderDescriptor = {
  id: 'groq',
  label: 'Groq',
  apiKeyEnv: 'GROQ_API_KEY',
  baseURLEnv: 'GROQ_BASE_URL',
  honorsResponseFormat: false,
  dropJsonMode: true,
  rateLimitFor: (modelId) => LIMITS.get(modelId),
};
