import type { ProviderDescriptor } from './types.js';

/**
 * OpenCode Zen — lõi mặc định, và là lõi MÙ về capability.
 *
 * `GET /zen/v1/models` trả đúng bốn trường cho mỗi model: `id`, `object`,
 * `created`, `owned_by`. Không có gì cho biết model làm được gì. Nên ở lõi này
 * chỉ phép đo mới biết, và danh sách dưới đây là kết quả đo thật chứ không suy
 * ra từ metadata — xem bảng model trong `CLAUDE.md`.
 */
export const opencode: ProviderDescriptor = {
  id: 'opencode',
  label: 'OpenCode Zen',
  apiKeyEnv: 'AI_API_KEY',
  userAgentEnv: 'OPENCODE_USER_AGENT',

  knownNoStructuredOutput: [
    // Trả content rỗng dù đã cho tới 1500 token.
    'laguna-s-2.1-free',
    // server_error.
    'ling-3.0-tiny-free',
  ],
};
