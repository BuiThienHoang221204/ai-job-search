import { randomUUID } from 'node:crypto';
import type { ProviderDescriptor } from './types.js';

export const omniroute: ProviderDescriptor = {
  id: 'omniroute',
  label: 'OmniRoute',
  apiKeyEnv: 'OMNIROUTE_API_KEY',
  baseURLEnv: 'OMNIROUTE_BASE_URL',
  userAgentEnv: 'OMNIROUTE_USER_AGENT',

  extraHeaders: {
    'x-omniroute-compression': 'off',
    'x-omniroute-no-memory': 'true',
    /*
     * Đi kèm `User-Agent: opencode` cho các model `oc/*`: OmniRoute CHUYỂN TIẾP
     * cả hai header lên OpenCode, và tier free của OpenCode đòi đủ cả hai. Thiếu
     * header này thì mọi model `oc/*` trả 400 `MissingSessionID` — đã đo qua
     * cổng ngày 2026-09-09. Lý do đầy đủ nằm ở `providers/opencode.ts`.
     */
    'x-opencode-session': randomUUID(),
  },

  explicitStreamFlag: true,
};
