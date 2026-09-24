import type { ProviderDescriptor } from './types.js';

/** Khác OpenCode đúng MỘT điểm đáng giá: `/api/v1/models` khai `supported_parameters`, nên biết trước model nào giữ được structured output mà không phải đốt hạn mức để thử. */
export const openrouter: ProviderDescriptor = {
  id: 'openrouter',
  label: 'OpenRouter',
  apiKeyEnv: 'OPENROUTER_API_KEY',

  declaresStructuredOutput: (entry) => {
    const params = entry.supported_parameters;
    return Array.isArray(params) && params.includes('structured_outputs');
  },
};
