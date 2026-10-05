import { findProvider, providerIds } from '../providers/index.js';
import type { RateLimitSpec } from '../providers/types.js';
import { formatModelRef, parseModelRef } from './model-ref.js';

/** Giữ lịch sử đủ dài cho trần RỘNG NHẤT đã khai (Gemini RPD = 24 giờ) — ngắn hơn thì `hasRoom` không bao giờ thấy được lượt dùng cũ để tính đúng RPD. */
const RETENTION_MS = 25 * 60 * 60 * 1000;

/** Ước lượng thô ~4 ký tự/token — CHỦ ĐÍCH không chính xác, vì sai thì vẫn còn lưới 429/TPM-exceeded của `ModelChain` đỡ. Không phải điểm cần đúng tuyệt đối. */
export function estimateTokens(system: string, prompt: string): number {
  return Math.ceil((system.length + prompt.length) / 4);
}

type Usage = { at: number; tokens: number };

/** State in-memory, chỉ đúng trong MỘT process — app hiện chạy `APP_ROLE=all` một process nên chấp nhận được; chưa giải bài toán đa-process. */
const usages = new Map<string, Usage[]>();

function canonical(ref: string, defaultProviderId: string): string {
  return formatModelRef(parseModelRef(ref, providerIds(), defaultProviderId));
}

/** Một model có thể bị chặn bởi NHIỀU trần cùng lúc (vd Gemini: RPM 5 VÀ RPD 20) — thoả RPM không có nghĩa thoả RPD, nên phải thoả HẾT mới coi là còn chỗ. */
function hasRoomFor(
  spec: RateLimitSpec,
  key: string,
  estimatedTokens: number,
  now: number,
): boolean {
  const recent = (usages.get(key) ?? []).filter(
    (u) => now - u.at < spec.windowMs,
  );

  if (spec.kind === 'count') {
    return recent.length < spec.limit;
  }

  const used = recent.reduce((sum, u) => sum + u.tokens, 0);
  return used + estimatedTokens <= spec.limit;
}

/** Không khai `rateLimitFor` (lõi chưa đo) → luôn còn chỗ, giữ hành vi mặc định hiện tại. `count` đếm SỐ LƯỢT trong window (UnoRouter: limit=1; Gemini RPM: limit=15-30) — không phải "chỉ 1 lượt/window" cố định. */
function hasRoom(key: string, estimatedTokens: number, now: number): boolean {
  const slash = key.indexOf('/');
  const providerId = key.slice(0, slash);
  const modelId = key.slice(slash + 1);
  const specs = findProvider(providerId)?.rateLimitFor?.(modelId);
  if (!specs?.length) return true;

  return specs.every((spec) => hasRoomFor(spec, key, estimatedTokens, now));
}

/** Mắt xích đầu tiên trong `candidates` (giữ đúng thứ tự ưu tiên đã đo) còn chỗ ngay bây giờ. `undefined` = không cái nào chắc chắn còn chỗ — người gọi dùng lại mắt xích mặc định như cũ, để `ModelChain` tự domino. */
export function pickStart(
  candidates: readonly string[],
  estimatedTokens: number,
  defaultProviderId: string,
  now = Date.now(),
): string | undefined {
  for (const candidate of candidates) {
    const key = canonical(candidate, defaultProviderId);
    if (hasRoom(key, estimatedTokens, now)) return candidate;
  }
  return undefined;
}

/** Ghi nhận một lượt DÙNG THẬT — gọi từ `AiService`, nơi duy nhất mọi lời gọi model đi qua, không điều kiện gì (lõi chưa khai trần thì ghi vào Map nhưng `hasRoom` không bao giờ đọc tới). */
export function markUsed(
  providerModelKey: string,
  estimatedTokens: number,
  now = Date.now(),
): void {
  const recent = (usages.get(providerModelKey) ?? []).filter(
    (u) => now - u.at < RETENTION_MS,
  );
  recent.push({ at: now, tokens: estimatedTokens });
  usages.set(providerModelKey, recent);
}
