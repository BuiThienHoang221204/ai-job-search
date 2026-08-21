/**
 * Bóc chữ ra khỏi HTML.
 *
 * Giải entity TRƯỚC khi bỏ thẻ, và `&amp;` giải CUỐI - sai thứ tự thì `&lt;p&gt;`
 * biến thành `<p>` rồi bị xoá mất cả chữ bên trong. Cùng một bài học đã trả giá
 * ở `ats-source.service.ts`.
 */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const decoded = withoutBlocks
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

  return decoded
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
