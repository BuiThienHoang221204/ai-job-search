import { pickStart } from '../modules/ai/utils/fast-model-scheduler';

export function modelIdsFrom(raw: string | undefined): string[] | undefined {
  const ids = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

/** Chọn mắt xích đầu cho các điểm gọi AI_FAST_* theo model còn hạn mức ngay lúc này. */
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
