import type { ProviderDescriptor } from './types.js';

/** Lõi ĐỨNG CUỐI chuỗi: nhận request không cần API key, nhưng 14/14 model free tự khai `mayTrainOnYourPrompts` nên không làm lõi chính được. */
export const kilo: ProviderDescriptor = {
  id: 'kilo',
  label: 'Kilo',
  apiKeyEnv: 'KILO_API_KEY',

  // Cố ý KHÔNG khai `declaresStructuredOutput` dù `/models` có trả: lời khai đó đã đo là SAI, xem CLAUDE.md.
  knownNoStructuredOutput: [
    // Đo trên prompt thật: không khớp schema.
    'stepfun/step-3.7-flash:free',
    // Cùng model đã đo là hỏng bên OpenCode.
    'poolside/laguna-s-2.1:free',
  ],
};
