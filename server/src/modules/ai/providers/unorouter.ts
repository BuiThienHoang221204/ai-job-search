import { MINUTE_MS } from '@/common/duration';
import type { ProviderDescriptor } from './types';

const UNOROUTER_NON_CHAT = [
  'diffusion',
  'sdxl',
  'pony',
  'anime',
  'reality',
  'albedobase',
  'deliberate',
  'dreamshaper',
  'fustercluck',
  'icbinp',
  'juggernaut',
  'animerge',
  'amponyxl',
  'cyberrealistic',
  'swamponyxl',
  'tunix',
  'wai-',
  'ntr-mix',
  'prefect',
  'quiet-goodnight',
  'rev-animated',
  'aura-1',
  'anything-',
  'bge-',
  'checkpoint',
  'illustrious',
];

export const unorouter: ProviderDescriptor = {
  id: 'unorouter',
  label: 'UnoRouter',
  apiKeyEnv: 'UNOROUTER_API_KEY',
  baseURLEnv: 'UNOROUTER_BASE_URL',
  honorsResponseFormat: false,
  filterModel: (id) => {
    const lower = id.toLowerCase();
    return !UNOROUTER_NON_CHAT.some((word) => lower.includes(word));
  },
  rateLimitFor: () => [{ kind: 'count', windowMs: MINUTE_MS, limit: 1 }],
};
