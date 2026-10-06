import type { ProviderDescriptor } from './types';

/** Lõi MÙ về capability: `/zen/v1/models` chỉ trả `id`/`object`/`created`/`owned_by`, nên ở đây chỉ phép ĐO mới biết model làm được gì. */
export const opencode: ProviderDescriptor = {
  id: 'opencode',
  label: 'OpenCode Zen',
  apiKeyEnv: 'AI_API_KEY',
  userAgentEnv: 'OPENCODE_USER_AGENT',

  /** Trỏ sang container bọc `opencode run`; bỏ trống thì rơi về đường thẳng tới opencode.ai, và đường đó 403 chắc chắn. */
  baseURLEnv: 'OPENCODE_SERVICE_URL',

  /** Container `opencode-service` chỉ chạy `OPENCODE_MAX_CONCURRENCY` tiến trình CLI cùng lúc (mặc định 2) - đo thật 2026-10-03: nhiều purpose cùng mặc định gọi lõi này, dồn quá trần thì ra "đầy (2/2)" và timeout hàng loạt dù model vẫn khoẻ. */
  maxConcurrencyEnv: 'OPENCODE_APP_CONCURRENCY',

  /** Wrapper CLI chỉ chuyển tiếp thân request, không ép định dạng — schema phải đi đường bơm vào prompt. */
  honorsResponseFormat: false,

  /** Mọi model, vì bể free xoay vòng nên danh sách tên cứng sẽ lỗi thời; stream hỏng trước mảnh đầu vẫn rơi về đường không-stream. */
  streamsJson: 'all',

  knownNoStructuredOutput: [
    // Trả content rỗng dù đã cho tới 1500 token.
    'laguna-s-2.1-free',
    // server_error.
    'ling-3.0-tiny-free',
  ],
};
