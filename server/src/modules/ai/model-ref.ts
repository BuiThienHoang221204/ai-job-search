/** Một mắt xích trong chuỗi model: chạy ở lõi nào, model nào. */
export type ModelRef = { providerId: string; modelId: string };

/**
 * Tách chuỗi `lõi/model`. Phải tách ở dấu `/` **ĐẦU TIÊN** vì model id của
 * OpenRouter tự nó chứa dấu `/`: `openrouter/openai/gpt-oss-20b:free` là lõi
 * `openrouter`, model `openai/gpt-oss-20b:free`.
 *
 * Không có tiền tố lõi hợp lệ thì cả chuỗi là model id của lõi mặc định — nhờ
 * vậy `MODEL_FALLBACK_IDS` viết theo kiểu cũ vẫn chạy nguyên. Cách mã hoá này
 * không nhập nhằng vì đã kiểm: 91 model của OpenCode không cái nào có dấu `/`,
 * còn 351 model của OpenRouter thì cái nào cũng có.
 */
export function parseModelRef(
  raw: string,
  knownProviderIds: readonly string[],
  defaultProviderId: string,
): ModelRef {
  const value = raw.trim();
  const slash = value.indexOf('/');

  if (slash > 0) {
    const prefix = value.slice(0, slash);
    const rest = value.slice(slash + 1);
    if (rest && knownProviderIds.includes(prefix)) {
      return { providerId: prefix, modelId: rest };
    }
  }

  return { providerId: defaultProviderId, modelId: value };
}

/** Ngược của `parseModelRef`. Dùng cho log và cho cột `modelId` của `ai_calls`. */
export function formatModelRef(ref: ModelRef): string {
  return `${ref.providerId}/${ref.modelId}`;
}
