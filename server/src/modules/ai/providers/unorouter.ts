import { MINUTE_MS } from '@/common/duration';
import type { ProviderDescriptor } from './types';

export const unorouter: ProviderDescriptor = {
  id: 'unorouter',
  label: 'UnoRouter',
  apiKeyEnv: 'UNOROUTER_API_KEY',
  baseURLEnv: 'UNOROUTER_BASE_URL',
  honorsResponseFormat: false,
  rateLimitFor: () => [{ kind: 'count', windowMs: MINUTE_MS, limit: 1 }],
};
