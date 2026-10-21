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
  'antigravity/gemini-3.7',
  'antigravity/gemini-pro-agent',
  'antigravity/gemini-3.1-pro',
  'agy/gemini-3.7',
  'agy/gemini-pro-agent',
  'agy/gemini-3.1-pro',
  'agy/gemini-3.6',
  'agy/gemini-4-argon',
  'agy/claude-opus-4-6-thinking-',
  'agy/claude-sonnet-4-6-',
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
    if (id.endsWith('openrouter/free') || id.endsWith('openrouter/auto')) {
      return false;
    }
    if (id.includes('claude-haiku')) return false;
    return (
      id.startsWith('ddgw/') ||
      id.startsWith('cfp/') ||
      id.startsWith('antigravity/') ||
      id.startsWith('agy/') ||
      id.includes('free')
    );
  },
};
