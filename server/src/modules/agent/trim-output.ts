const TEXT_LIMIT = 500;

export const trimToolOutput = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.length > TEXT_LIMIT
      ? `${value.slice(0, TEXT_LIMIT)}… [cắt ${value.length - TEXT_LIMIT} ký tự]`
      : value;
  }
  if (Array.isArray(value)) return value.map(trimToolOutput);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        trimToolOutput(item),
      ]),
    );
  }
  return value;
};
