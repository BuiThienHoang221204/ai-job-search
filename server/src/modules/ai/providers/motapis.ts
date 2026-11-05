import type { ProviderDescriptor } from './types';

export const motapis: ProviderDescriptor = {
  id: 'motapis',
  label: 'MotAPIs',
  apiKeyEnv: 'MOTAPIS_API_KEY',
  baseURLEnv: 'MOTAPIS_BASE_URL',
  honorsResponseFormat: false,
  streamsJson: [],
};
