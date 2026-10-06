import type { SandboxError } from '@/modules/sandbox/sandbox.interface';

export const LATEX_COMPILER = Symbol('LATEX_COMPILER');
export const PDF_RENDERER = Symbol('PDF_RENDERER');

export type PdfFailure = { ok: false; reason: string; log: string };

export type LatexCompileResult =
  { ok: true; pdf: Buffer; warnings: string[] } | PdfFailure;

export type PdfRenderResult =
  { ok: true; pdf: Buffer; pages: number } | PdfFailure;

export interface LatexCompiler {
  compile(tex: string): Promise<LatexCompileResult>;
  available(): Promise<boolean>;
}

export interface PdfRenderer {
  render(html: string): Promise<PdfRenderResult>;
  available(): Promise<boolean>;
}

export const EXPECTED_MAX_PAGES = 2;

export const PDF_UNAVAILABLE =
  'Máy chủ chưa bật được môi trường tạo PDF. Đây là lỗi cấu hình phía hệ thống, không phải do tài liệu của bạn.';

export function firstBangLine(log: string, fallback: string): string {
  const line = log.split('\n').find((row) => row.trimStart().startsWith('!'));
  if (!line) return fallback;
  return line.trim().replace(/^!\s*/, '');
}

export const firstTexError = (log: string): string =>
  firstBangLine(log, 'Không tạo được PDF và log không nêu lỗi cụ thể.');

export const firstRenderError = (log: string): string =>
  firstBangLine(log, 'Không tạo được PDF từ mẫu CV này.');

/** Ký tự font không vẽ được — đây là cách chữ tiếng Việt âm thầm biến mất khỏi PDF. */
export function missingGlyphs(log: string): string[] {
  const found = new Set<string>();

  for (const line of log.split('\n')) {
    const match = /Missing character: There is no (.+?) \(/.exec(line);
    if (match) found.add(match[1]);
  }

  return [...found];
}

export function countPages(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

/** Câu báo cho người dùng theo từng nguyên nhân sandbox hỏng. */
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
