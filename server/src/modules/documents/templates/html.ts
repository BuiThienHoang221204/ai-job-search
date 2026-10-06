export const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const joinParts = (
  parts: Array<string | null | undefined>,
  separator = ' · ',
): string =>
  parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator);

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
