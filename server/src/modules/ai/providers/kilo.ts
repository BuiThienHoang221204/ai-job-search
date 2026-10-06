import type { ProviderDescriptor } from './types';

export const kilo: ProviderDescriptor = {
  id: 'kilo',
  label: 'Kilo',
  apiKeyEnv: 'KILO_API_KEY',
  knownNoStructuredOutput: [
    'stepfun/step-3.7-flash:free',
    'poolside/laguna-s-2.1:free',
  ],
};
