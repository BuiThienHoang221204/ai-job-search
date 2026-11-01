import type { ProviderDescriptor } from './types';

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
  filterModel: (id) =>
    id.startsWith('ddgw/') ||
    id.startsWith('cfp/') ||
    id.startsWith('antigravity/') ||
    id.startsWith('agy/') ||
    id.includes('free'),
};
