import type { ProviderDescriptor } from './types.js';

/**
 * OpenRouter. Khác OpenCode đúng MỘT điểm có ý nghĩa, và đó là điểm đáng giá
 * nhất: `GET /api/v1/models` khai `supported_parameters` cho từng model, nên
 * biết trước model nào giữ được structured output mà không phải đốt hạn mức để
 * thử ra.
 *
 * Đã đối chiếu lời khai này với các phép đo cũ trên OpenCode và chúng khớp:
 * `nemotron-3.5-lightning` và `laguna-s-2.1` đều bị khai là không hỗ trợ, đúng
 * như đã đo được bằng tay.
 *
 * API của OpenRouter là OpenAI-compatible nên nó chạy bằng chính adapter đang
 * dùng; trường `npm` trong catalog trỏ tới SDK riêng của OpenRouter mà dự án
 * KHÔNG cài — xem `SUPPORTED_NPMS` trong `model-catalog.service.ts`.
 */
export const openrouter: ProviderDescriptor = {
  id: 'openrouter',
  label: 'OpenRouter',
  apiKeyEnv: 'OPENROUTER_API_KEY',

  declaresStructuredOutput: (entry) => {
    const params = entry.supported_parameters;
    return Array.isArray(params) && params.includes('structured_outputs');
  },
};
