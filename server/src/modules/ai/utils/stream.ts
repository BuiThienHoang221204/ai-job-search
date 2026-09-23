/** Stream rỗng cho trường hợp model không phát được mảnh nào — người gọi vẫn `for await` được mà không phải kiểm null. */
export async function* emptyStream(): AsyncIterable<unknown> {}

/** Nối lại mảnh ĐẦU đã lấy ra để thăm dò với phần còn lại của stream. */
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

/** Cắt GIỮA chứ không cắt đuôi: trường bị thiếu thường nằm ở cuối JSON, cắt đuôi là vứt đúng phần cần xem. */
export function clipMiddle(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  return [
    text.slice(0, half),
    `… [bỏ ${text.length - limit} ký tự ở giữa] …`,
    text.slice(-half),
  ].join('\n');
}
