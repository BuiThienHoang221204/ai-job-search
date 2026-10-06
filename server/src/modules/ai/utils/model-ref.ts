export type ModelRef = { providerId: string; modelId: string };

/** Tách ở dấu `/` ĐẦU TIÊN; không có tiền tố lõi hợp lệ thì cả chuỗi là model id của lõi mặc định. */
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

export function formatModelRef(ref: ModelRef): string {
  return `${ref.providerId}/${ref.modelId}`;
}
