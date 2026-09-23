import type { SandboxError } from '../../sandbox/sandbox.interface.js';

export const LATEX_COMPILER = Symbol('LATEX_COMPILER');
export const PDF_RENDERER = Symbol('PDF_RENDERER');

/** Cùng một hình dạng thất bại cho cả hai seam: câu cho người dùng, log cho người sửa. */
export type PdfFailure = { ok: false; reason: string; log: string };

export type LatexCompileResult =
  { ok: true; pdf: Buffer; warnings: string[] } | PdfFailure;

export type PdfRenderResult =
  { ok: true; pdf: Buffer; pages: number } | PdfFailure;

/** Biến một tài liệu LaTeX thành PDF. */
export interface LatexCompiler {
  compile(tex: string): Promise<LatexCompileResult>;
  /** Môi trường compile có dùng được hay không. `/ready` đọc cái này. */
  available(): Promise<boolean>;
}

/** Biến một tài liệu HTML tự chứa thành PDF. */
export interface PdfRenderer {
  render(html: string): Promise<PdfRenderResult>;
  /** Môi trường in có dùng được hay không. `/ready` đọc cái này. */
  available(): Promise<boolean>;
}

/** Ngưỡng CẢNH BÁO độ dài CV, không phải ngưỡng từ chối — vượt quá gần như luôn là lỗi trình bày. */
export const EXPECTED_MAX_PAGES = 2;

/** Một câu duy nhất cho mọi đường, để hai backend không nói hai kiểu về cùng một sự cố. */
export const PDF_UNAVAILABLE =
  'Máy chủ chưa bật được môi trường tạo PDF. Đây là lỗi cấu hình phía hệ thống, không phải do tài liệu của bạn.';

/** Dòng lỗi đầu, theo quy ước `!` của cả lualatex lẫn `pdf-service` — stderr Chromium đầy cảnh báo GPU kể cả lúc in xong. */
export function firstBangLine(log: string, fallback: string): string {
  const line = log.split('\n').find((row) => row.trimStart().startsWith('!'));
  if (!line) return fallback;
  return line.trim().replace(/^!\s*/, '');
}

export const firstTexError = (log: string): string =>
  firstBangLine(log, 'Không tạo được PDF và log không nêu lỗi cụ thể.');

export const firstRenderError = (log: string): string =>
  firstBangLine(log, 'Không tạo được PDF từ mẫu CV này.');

/** Những ký tự font không vẽ được — đây là cách chữ tiếng Việt biến mất khỏi PDF. */
export function missingGlyphs(log: string): string[] {
  const found = new Set<string>();

  for (const line of log.split('\n')) {
    const match = /Missing character: There is no (.+?) \(/.exec(line);
    if (match) found.add(match[1]);
  }

  return [...found];
}

/** Bản TypeScript của `count_pages` trong `pdf-service/server.py`. `latin1` vì utf8 thay byte hỏng bằng U+FFFD. */
export function countPages(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

/** Câu cho người dùng theo từng nguyên nhân của sandbox; `missingImage` là chỗ duy nhất hai seam khác nhau. */
export function sandboxReason(
  error: SandboxError,
  missingImage: string,
): string {
  switch (error.kind) {
    case 'TIMEOUT':
      return 'Quá thời gian khi tạo PDF. Hãy thử lại; nếu vẫn vậy thì tài liệu có thể quá dài.';
    case 'RUNTIME_UNAVAILABLE':
      return PDF_UNAVAILABLE;
    case 'IMAGE_MISSING':
      return missingImage;
    default:
      return 'Không tạo được PDF.';
  }
}
