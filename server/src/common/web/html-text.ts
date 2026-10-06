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

const CHROME =
  /<(script|style|noscript|svg|nav|header|footer|form|select|template|iframe|button)\b[\s\S]*?<\/\1>/gi;

const UNRENDERED = /\{\{|\}\}/;

const DEDUPE_UNDER = 80;

/** Bóc chữ một trang web: bỏ khung giao diện, khuôn Vue chưa render và dòng menu lặp. */
export function pageToText(html: string): string {
  const text = htmlToText(html.replace(CHROME, ' '));
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || UNRENDERED.test(line)) continue;

    const key = line.toLowerCase();
    if (line.length < DEDUPE_UNDER && seen.has(key)) continue;

    seen.add(key);
    lines.push(line);
  }

  return lines.join('\n');
}
