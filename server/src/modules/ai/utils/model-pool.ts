export type ModelHealth = {
  modelId: string;
  healthy: boolean;
  latencyMs: number;
  lastCheckedAt: number;
  consecutiveFailures: number;
  cooldownUntil?: number;
  error?: string;
};

const NOT_CHAT_WORDS = [
  'embed',
  'whisper',
  'tts',
  'audio',
  'transcribe',
  'image',
  'vision',
  'diffusion',
  'guard',
  'safety',
  'beam',
  'pickle',
  'bunny',
];

const PAID_PROVIDERS = ['openrouter', 'unorouter', 'kilo'];

const UNMEASURED_MS = Number.MAX_SAFE_INTEGER;

function providerOf(ref: string): string {
  return ref.slice(0, ref.indexOf('/'));
}

/** Vị trí của lõi trong danh sách ưu tiên; lõi không khai thì xếp sau cùng. */
function providerRank(ref: string, providers: string[]): number {
  const index = providers.indexOf(providerOf(ref));
  return index === -1 ? providers.length : index;
}

/** Model quét được có đáng probe không: bỏ model không phải chat, lõi trả phí thì chỉ lấy bản free. */
export function isProbeCandidate(ref: string): boolean {
  const lower = ref.toLowerCase();
  if (NOT_CHAT_WORDS.some((word) => lower.includes(word))) return false;

  if (PAID_PROVIDERS.includes(providerOf(lower))) return lower.includes('free');
  return true;
}

/** Thứ tự chuỗi: model trượt probe xuống cuối, model khai trong .env trước model quét được, rồi theo thứ tự lõi, rồi độ trễ. */
export function rankModels(
  candidates: string[],
  providers: string[],
  seeds: string[],
  health: Map<string, ModelHealth>,
): string[] {
  return [...new Set(candidates)].sort((a, b) => {
    const infoA = health.get(a);
    const infoB = health.get(b);
    const failedA = infoA?.healthy === false ? 1 : 0;
    const failedB = infoB?.healthy === false ? 1 : 0;
    if (failedA !== failedB) return failedA - failedB;

    const seedA = seeds.includes(a) ? 0 : 1;
    const seedB = seeds.includes(b) ? 0 : 1;
    if (seedA !== seedB) return seedA - seedB;

    const rankA = providerRank(a, providers);
    const rankB = providerRank(b, providers);
    if (rankA !== rankB) return rankA - rankB;

    return (
      (infoA?.latencyMs || UNMEASURED_MS) - (infoB?.latencyMs || UNMEASURED_MS)
    );
  });
}
