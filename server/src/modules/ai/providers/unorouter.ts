import { MINUTE_MS } from '@/common/duration';
import type { ProviderDescriptor } from './types';

export const unorouter: ProviderDescriptor = {
  id: 'unorouter',
  label: 'UnoRouter',
  apiKeyEnv: 'UNOROUTER_API_KEY',
  baseURLEnv: 'UNOROUTER_BASE_URL',
  honorsResponseFormat: false,

  /** Đo trực tiếp 2026-10-04: HTTP 429 "allows 1 request(s) every 1 min per account", đúng cho mọi model đã thử. */
  rateLimitFor: () => [{ kind: 'count', windowMs: MINUTE_MS, limit: 1 }],
};
