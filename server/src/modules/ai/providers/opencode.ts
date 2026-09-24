import type { ProviderDescriptor } from './types.js';

/** Lõi MÙ về capability: `/zen/v1/models` chỉ trả `id`/`object`/`created`/`owned_by`, nên ở đây chỉ phép ĐO mới biết model làm được gì. */
export const opencode: ProviderDescriptor = {
  id: 'opencode',
  label: 'OpenCode Zen',
  apiKeyEnv: 'AI_API_KEY',
  userAgentEnv: 'OPENCODE_USER_AGENT',

  /** Trỏ sang container bọc `opencode run`; bỏ trống thì rơi về đường thẳng tới opencode.ai, và đường đó 403 chắc chắn. */
  baseURLEnv: 'OPENCODE_SERVICE_URL',

  /** Wrapper CLI chỉ chuyển tiếp thân request, không ép định dạng — schema phải đi đường bơm vào prompt. */
  honorsResponseFormat: false,

  knownNoStructuredOutput: [
    // Trả content rỗng dù đã cho tới 1500 token.
    'laguna-s-2.1-free',
    // server_error.
    'ling-3.0-tiny-free',
  ],
};
