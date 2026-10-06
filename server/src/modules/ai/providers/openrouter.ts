import type { ProviderDescriptor } from './types';

export const openrouter: ProviderDescriptor = {
  id: 'openrouter',
  label: 'OpenRouter',
  apiKeyEnv: 'OPENROUTER_API_KEY',
  declaresStructuredOutput: (entry) => {
    const params = entry.supported_parameters;
    return Array.isArray(params) && params.includes('structured_outputs');
  },
};
