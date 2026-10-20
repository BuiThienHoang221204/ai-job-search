import type { ProviderDescriptor } from './types';

const EXPERIMENTAL_WORDS = ['preview', 'alpha', 'beta', 'test', 'exp'];

export const opencode: ProviderDescriptor = {
  id: 'opencode',
  label: 'OpenCode Zen',
  apiKeyEnv: 'AI_API_KEY',
  userAgentEnv: 'OPENCODE_USER_AGENT',
  baseURLEnv: 'OPENCODE_SERVICE_URL',
  honorsResponseFormat: false,
  streamsJson: 'all',
  knownNoStructuredOutput: ['laguna-s-2.1-free', 'ling-3.0-tiny-free'],
  filterModel: (id) => {
    const lower = id.toLowerCase();
    if (!lower.includes('free')) return false;
    return !EXPERIMENTAL_WORDS.some((word) => lower.includes(word));
  },
};
