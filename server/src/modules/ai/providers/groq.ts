import type { ProviderDescriptor } from './types.js';

/** LPU của Groq suy luận nhanh hơn hẳn các lõi khác — dùng cho tác vụ người dùng đang đứng chờ (Tier 1/2), không phải lõi mặc định cho việc chạy nền. */
export const groq: ProviderDescriptor = {
  id: 'groq',
  label: 'Groq',
  apiKeyEnv: 'GROQ_API_KEY',

  /** Groq không có trong catalog models.opencode.ai; endpoint OpenAI-compatible riêng nên phải tự dựng danh sách model từ chính /models của nó. */
  baseURLEnv: 'GROQ_BASE_URL',

  /** Đo 2026-09-30 trên schema thật của match.evaluate: Groq áp chế độ "strict" của OpenAI, đòi MỌI field có mặt trong `required` — schema của app dùng `.optional()`/`.default()` tự do nên bị 400 ngay từ request, không tới lượt model chạy. */
  honorsResponseFormat: false,
};
