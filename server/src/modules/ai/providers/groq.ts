import type { ProviderDescriptor } from './types.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** LPU của Groq suy luận nhanh hơn hẳn các lõi khác — dùng cho tác vụ người dùng đang đứng chờ (Tier 1/2), không phải lõi mặc định cho việc chạy nền. */
export const groq: ProviderDescriptor = {
  id: 'groq',
  label: 'Groq',
  apiKeyEnv: 'GROQ_API_KEY',

  /** Groq không có trong catalog models.opencode.ai; endpoint OpenAI-compatible riêng nên phải tự dựng danh sách model từ chính /models của nó. */
  baseURLEnv: 'GROQ_BASE_URL',

  /** Đo 2026-09-30 trên schema thật của match.evaluate: Groq áp chế độ "strict" của OpenAI, đòi MỌI field có mặt trong `required` — schema của app dùng `.optional()`/`.default()` tự do nên bị 400 ngay từ request, không tới lượt model chạy. */
  honorsResponseFormat: false,

  /** Số liệu thật từ console Groq 2026-10-05: TPM 8.000 ăn hết trước RPM 30 nên không cần theo dõi RPM riêng, nhưng TPD 200.000/ngày chỉ đủ ~35-65 lượt — thấp hơn nhiều so với TPM/phút gợi ý, phải theo dõi cả hai. */
  rateLimitFor: (modelId) => {
    if (modelId === 'openai/gpt-oss-safeguard-20b') {
      return [{ kind: 'token', windowMs: MINUTE_MS, limit: 2000 }];
    }
    if (
      modelId === 'openai/gpt-oss-120b' ||
      modelId === 'openai/gpt-oss-20b' ||
      modelId === 'qwen/qwen3.8-27b'
    ) {
      return [
        { kind: 'token', windowMs: MINUTE_MS, limit: 8000 },
        { kind: 'token', windowMs: DAY_MS, limit: 200_000 },
        { kind: 'count', windowMs: DAY_MS, limit: 1000 },
      ];
    }
    return undefined;
  },
};
