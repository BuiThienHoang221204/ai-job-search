import type { ProviderDescriptor } from './types';

export const opencode: ProviderDescriptor = {
  id: 'opencode',
  label: 'OpenCode Zen',
  apiKeyEnv: 'AI_API_KEY',
  userAgentEnv: 'OPENCODE_USER_AGENT',
  baseURLEnv: 'OPENCODE_SERVICE_URL',
  maxConcurrencyEnv: 'OPENCODE_APP_CONCURRENCY',
  honorsResponseFormat: false,
  streamsJson: 'all',
  knownNoStructuredOutput: ['laguna-s-2.1-free', 'ling-3.0-tiny-free'],
};
