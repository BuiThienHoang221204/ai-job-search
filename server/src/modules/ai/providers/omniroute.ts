import type { ProviderDescriptor } from './types';

const BROKEN_PREFIXES = [
  'auto/',
  'oc/',
  'dva/',
  'aug/',
  'zc/',
  'cxa/',
  'tllm/',
  'cl/',
  'cline/',
];

export const omniroute: ProviderDescriptor = {
  id: 'omniroute',
  label: 'OmniRoute',
  apiKeyEnv: 'OMNIROUTE_API_KEY',
  baseURLEnv: 'OMNIROUTE_BASE_URL',
  honorsResponseFormat: false,
  streamsJson: [],
  extraHeaders: {
    'x-omniroute-compression': 'off',
    'x-omniroute-no-memory': 'true',
  },
  explicitStreamFlag: true,
  filterModel: (id) => {
    if (BROKEN_PREFIXES.some((p) => id.startsWith(p))) return false;
    if (id.includes('claude-haiku')) return false;
    return (
      id.startsWith('ddgw/') || id.startsWith('cfp/') || id.includes('free')
    );
  },
};
