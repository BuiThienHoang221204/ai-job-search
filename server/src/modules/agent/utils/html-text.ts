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

/**
 * Khối không bao giờ chứa nội dung tin tuyển dụng.
 *
 * Không lồng vào chính nó nên bắt bằng regex không tham lam là đủ; `div` thì
 * ngược lại, và đó là lý do danh sách này dừng ở các thẻ ngữ nghĩa.
 */
const CHROME =
  /<(script|style|noscript|svg|nav|header|footer|form|select|template|iframe|button)\b[\s\S]*?<\/\1>/gi;

/** Dòng khung mẫu Vue/Angular chưa được render, ví dụ `{{ company?.name }}`. */
const UNRENDERED = /\{\{|\}\}/;

/** Dòng ngắn lặp lại là menu; dòng dài lặp lại có thể là nội dung thật. */
const DEDUPE_UNDER = 80;

/**
 * Bóc chữ của MỘT TRANG WEB, khác với bóc chữ của một đoạn HTML.
 *
 * `htmlToText` một mình là không đủ, và cái giá đã trả rất cụ thể: trang chi
 * tiết của TopCV cho ra 104.200 ký tự, trong đó "Mô tả công việc" nằm ở ký tự
 * **23.013** - ngay sau mốc cắt 20.000. Model nhận về đúng 20.000 ký tự đầu:
 * biểu ngữ cookie, widget hỗ trợ, bộ chọn tỉnh thành. Nó kết luận "trang render
 * bằng JavaScript nên không lấy được nội dung" rồi đi hỏi người dùng, trong khi
 * mô tả công việc nằm nguyên trong dữ liệu đã tải về.
 *
 * Chẩn đoán sai đó có nguồn: khung Vue chưa render (`{{ company?.name }}`) lọt
 * vào phần chữ, trông y như bằng chứng trang là SPA. Nên dọn chúng đi vừa để
 * tiết kiệm chỗ, vừa để bỏ một dấu vết đánh lừa.
 *
 * Đo sau khi dọn: TopCV 104.200 -> 64.826 ký tự, "Mô tả công việc" lùi về ký tự
 * **7.142**; ITviec 80.956 -> 21.179.
 */
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
