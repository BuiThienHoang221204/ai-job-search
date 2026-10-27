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

const BLURRED =
  /<([a-z][a-z0-9]*)\b[^>]*\bclass\s*=\s*(["'])(?:[^"']*\s)?blur(?:\s[^"']*)?\2[^>]*>/gi;

function closingEnd(html: string, tag: string, from: number): number {
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  tags.lastIndex = from;
  let depth = 1;
  let match = tags.exec(html);
  while (match) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return tags.lastIndex;
    match = tags.exec(html);
  }
  return html.length;
}

function dropBlurred(html: string): string {
  const kept: string[] = [];
  let from = 0;
  BLURRED.lastIndex = 0;
  let open = BLURRED.exec(html);
  while (open) {
    kept.push(html.slice(from, open.index));
    from = closingEnd(html, open[1], BLURRED.lastIndex);
    BLURRED.lastIndex = from;
    open = BLURRED.exec(html);
  }
  kept.push(html.slice(from));
  return kept.join(' ');
}

const UNRENDERED = /\{\{|\}\}/;

const DEDUPE_UNDER = 80;

/** Bóc chữ một trang web: bỏ khung giao diện, phần bị làm mờ chờ đăng nhập, khuôn Vue chưa render và dòng menu lặp. */
export function pageToText(html: string): string {
  const text = htmlToText(dropBlurred(html).replace(CHROME, ' '));
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
