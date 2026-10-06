import { pickStart } from '../modules/ai/utils/fast-model-scheduler.js';

/** Đọc một biến môi trường dạng danh sách "a,b,c" thành mảng đã trim, bỏ rỗng; trả `undefined` khi rỗng — mảng RỖNG (khác `undefined`) sẽ bị `ModelChain` hiểu là "cố ý không có mắt xích dự phòng nào" và xoá mất `MODEL_FALLBACK_IDS` mặc định. */
export function modelIdsFrom(raw: string | undefined): string[] | undefined {
  const ids = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

/** Chọn TRƯỚC mắt xích bắt đầu cho các điểm gọi AI_FAST_* theo model nào còn chỗ NGAY BÂY GIỜ (xem `fast-model-scheduler.ts`); `fallbackModelIds` giữ nguyên danh sách gốc vì `ModelChain.links()` đã tự dedupe. */
export function fastModelChain(estimatedTokens: number): {
  modelId?: string;
  fallbackModelIds?: string[];
} {
  const primary = process.env.AI_FAST_MODEL_ID || undefined;
  const fallbackModelIds = modelIdsFrom(process.env.AI_FAST_FALLBACK_IDS);
  const candidates = [primary, ...(fallbackModelIds ?? [])].filter(
    (id): id is string => Boolean(id),
  );
  const defaultProviderId = process.env.MODEL_PROVIDER || 'omniroute';

  const chosen = candidates.length
    ? pickStart(candidates, estimatedTokens, defaultProviderId)
    : undefined;

  return { modelId: chosen ?? primary, fallbackModelIds };
}
