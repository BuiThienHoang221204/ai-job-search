export async function* emptyStream(): AsyncIterable<unknown> {}

export async function* streamFrom(
  head: unknown,
  rest: AsyncIterator<unknown>,
): AsyncIterable<unknown> {
  yield head;
  while (true) {
    const next = await rest.next();
    if (next.done === true) return;
    yield next.value;
  }
}

/** Cắt GIỮA chứ không cắt đuôi: trường bị thiếu thường nằm ở cuối JSON. */
export function clipMiddle(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  return [
    text.slice(0, half),
    `… [bỏ ${text.length - limit} ký tự ở giữa] …`,
    text.slice(-half),
  ].join('\n');
}
