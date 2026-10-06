import type { ProviderDescriptor } from './types';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Không có trong catalog models.opencode.ai, không cần thẻ thanh toán để lấy key (đo 2026-10-05, khác Cerebras). */
export const gemini: ProviderDescriptor = {
  id: 'gemini',
  label: 'Gemini API',
  apiKeyEnv: 'GOOGLE_GEMINI_API_KEY',
  baseURLEnv: 'GOOGLE_GEMINI_BASE_URL',

  /** RPM + RPD thật từ aistudio.google.com/rate-limit của tài khoản 2026-10-05 — cả hai cùng áp dụng, RPM dư không có nghĩa RPD còn (vd nhóm 5 RPM/20 RPD cạn RPD rất nhanh). KHÔNG lấy từ trang pricing công khai (đã lệch nhiều lần với số thật trong repo này); TPM 250.000 quá lớn so với prompt production nên không theo dõi. Catalog trả id có tiền tố `models/`, phải giữ nguyên khi so khớp. */
  rateLimitFor: (modelId) => {
    if (
      modelId === 'models/gemini-3.5-flash-lite' ||
      modelId === 'models/gemini-3.1-flash-lite'
    ) {
      return [
        { kind: 'count', windowMs: MINUTE_MS, limit: 15 },
        { kind: 'count', windowMs: DAY_MS, limit: 500 },
      ];
    }
    if (
      modelId === 'models/gemini-3.6-flash' ||
      modelId === 'models/gemini-3.7-flash' ||
      modelId === 'models/gemini-3.8-flash' ||
      modelId === 'models/gemini-3-flash' ||
      modelId === 'models/gemini-3-flash-preview' ||
      modelId === 'models/gemini-3.5-flash' ||
      modelId === 'models/gemini-2.5-flash' ||
      modelId === 'models/gemini-robotics-er-2-preview'
    ) {
      return [
        { kind: 'count', windowMs: MINUTE_MS, limit: 5 },
        { kind: 'count', windowMs: DAY_MS, limit: 20 },
      ];
    }
    if (modelId === 'models/gemini-2.5-flash-lite') {
      return [
        { kind: 'count', windowMs: MINUTE_MS, limit: 10 },
        { kind: 'count', windowMs: DAY_MS, limit: 20 },
      ];
    }
    if (
      modelId === 'models/gemma-4-26b-a4b-it' ||
      modelId === 'models/gemma-4-31b-it'
    ) {
      return [
        { kind: 'count', windowMs: MINUTE_MS, limit: 30 },
        { kind: 'count', windowMs: DAY_MS, limit: 14_400 },
      ];
    }
    return undefined;
  },
};
