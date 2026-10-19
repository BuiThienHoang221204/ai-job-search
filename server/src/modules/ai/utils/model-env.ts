import { pickStart } from './fast-model-scheduler';

export function modelIdsFrom(raw: string | undefined): string[] | undefined {
  const ids = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

let fastPoolResolver: (() => string[]) | undefined;

export function setFastPoolResolver(
  resolver: (() => string[]) | undefined,
): void {
  fastPoolResolver = resolver;
}

/** Chọn mắt xích đầu cho các điểm gọi AI_FAST_* theo model còn hạn mức ngay lúc này; bể fast có từ hai model thì thay cho `AI_FAST_FALLBACK_IDS`. */
export function fastModelChain(estimatedTokens: number): {
  modelId?: string;
  fallbackModelIds?: string[];
} {
  const primary = process.env.AI_FAST_MODEL_ID || undefined;
  const pooled = fastPoolResolver?.() ?? [];
  const fallbackModelIds =
    pooled.length > 1 ? pooled : modelIdsFrom(process.env.AI_FAST_FALLBACK_IDS);
  const candidates = pooled.length
    ? pooled
    : [primary, ...(fallbackModelIds ?? [])].filter((id): id is string =>
        Boolean(id),
      );
  const defaultProviderId = process.env.MODEL_PROVIDER || 'omniroute';

  const chosen = candidates.length
    ? pickStart(candidates, estimatedTokens, defaultProviderId)
    : undefined;

  return { modelId: chosen ?? primary, fallbackModelIds };
}
