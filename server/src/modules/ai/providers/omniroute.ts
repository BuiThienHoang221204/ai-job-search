import type { ProviderDescriptor } from './types';

const CFP_MAX_PROMPT_CHARS = 6_000;

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
  maxPromptCharsFor: (id) =>
    id.startsWith('cfp/') ? CFP_MAX_PROMPT_CHARS : undefined,
  filterModel: (id) =>
    id.startsWith('ddgw/') ||
    id.startsWith('cfp/') ||
    id.startsWith('grok-cli/') ||
    id.startsWith('kiro/') ||
    id.startsWith('cbai/') ||
    id.startsWith('antigravity/') ||
    id.startsWith('agy/') ||
    id.includes('free'),
};
