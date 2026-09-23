import { randomUUID } from 'node:crypto';
import type { ProviderDescriptor } from './types.js';

/** Lõi MÙ về capability: `/zen/v1/models` chỉ trả `id`/`object`/`created`/`owned_by`, nên ở đây chỉ phép ĐO mới biết model làm được gì. */
export const opencode: ProviderDescriptor = {
  id: 'opencode',
  label: 'OpenCode Zen',
  apiKeyEnv: 'AI_API_KEY',
  userAgentEnv: 'OPENCODE_USER_AGENT',

  /** Session tự sinh KHÔNG còn đủ từ 2026-09-17 — OpenCode kiểm thứ gắn với một phiên THẬT. Xem mục "Cập nhật 2026-09-17" trong CLAUDE.md. */
  extraHeaders: {
    'x-opencode-session': `ses_${randomUUID().replace(/-/g, '').slice(0, 26)}`,
  },

  knownNoStructuredOutput: [
    // Trả content rỗng dù đã cho tới 1500 token.
    'laguna-s-2.1-free',
    // server_error.
    'ling-3.0-tiny-free',
  ],
};
