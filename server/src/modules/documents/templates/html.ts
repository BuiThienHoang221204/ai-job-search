/** Hạ tầng dùng chung cho mọi mẫu CV dạng HTML. Dáng vẻ nằm ở `themes.ts`. */

/** Ranh giới an toàn: bản HTML này nhúng vào iframe trong phiên đăng nhập, sót một dấu `<` là một lỗ XSS. */
export const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Ghép các mảnh có thật thành một dòng, bỏ qua mảnh thiếu. */
export const joinParts = (
  parts: Array<string | null | undefined>,
  separator = ' · ',
): string =>
  parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator);

/** HTML phải TỰ CHỨA: `pdf-service` chặn mọi tên miền, tài nguyên ngoài rơi về font thay thế mà không báo lỗi. */
export const htmlDocument = (options: {
  title: string;
  css: string;
  body: string;
}): string => `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'">
<title>${escapeHtml(options.title)}</title>
<style>
${options.css}
</style>
</head>
<body>
${options.body}
</body>
</html>
`;

/** CSS chống vỡ trang; mỗi luật sửa một kiểu hỏng cụ thể — chi tiết ở CLAUDE.md, mục "CV đi đường HTML". */
export const printBaseCss = `
/* Chromium không in màu nền: thiếu dòng này thì mẫu có dải màu in ra trắng trơn, dù xem trước vẫn đúng. */
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

* { margin: 0; padding: 0; box-sizing: border-box; }

p, li { orphans: 2; widows: 2; }

/* Tiêu đề mục không được là dòng cuối trang. Bản HTML của \\needspace bên LaTeX. */
.section-title { break-after: avoid; page-break-after: avoid; }

/* Một mục kinh nghiệm không được cắt làm đôi giữa hai trang. */
.entry { break-inside: avoid; page-break-inside: avoid; }
`;
