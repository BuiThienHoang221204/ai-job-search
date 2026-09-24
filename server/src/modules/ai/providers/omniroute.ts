import type { ProviderDescriptor } from './types.js';

export const omniroute: ProviderDescriptor = {
  id: 'omniroute',
  label: 'OmniRoute',
  apiKeyEnv: 'OMNIROUTE_API_KEY',
  baseURLEnv: 'OMNIROUTE_BASE_URL',
  honorsResponseFormat: false,

  /** RỖNG có chủ ý: chưa model nào qua lõi này stream ra JSON sạch trên prompt THẬT. Đo bằng prompt rút gọn sẽ cho kết quả sai — xem CLAUDE.md. */
  streamsJson: [],

  extraHeaders: {
    'x-omniroute-compression': 'off',
    'x-omniroute-no-memory': 'true',
  },

  explicitStreamFlag: true,
};
