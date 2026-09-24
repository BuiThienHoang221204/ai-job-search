/** Một mắt xích trong chuỗi model: chạy ở lõi nào, model nào. */
export type ModelRef = { providerId: string; modelId: string };

/** Tách ở dấu `/` ĐẦU TIÊN vì model id của OpenRouter tự nó chứa `/`. Không có tiền tố hợp lệ thì cả chuỗi là model id của lõi mặc định, nên `.env` cũ vẫn chạy. */
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
