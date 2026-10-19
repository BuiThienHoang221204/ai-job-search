import type { SandboxError } from '@/modules/sandbox/sandbox.interface';

export const PDF_RENDERER = Symbol('PDF_RENDERER');

export type PdfFailure = { ok: false; reason: string; log: string };

export type PdfRenderResult =
  { ok: true; pdf: Buffer; pages: number } | PdfFailure;

export interface PdfRenderer {
  render(html: string): Promise<PdfRenderResult>;
}

export const EXPECTED_MAX_PAGES = 2;

export const PDF_UNAVAILABLE =
  'Máy chủ chưa bật được môi trường tạo PDF. Đây là lỗi cấu hình phía hệ thống, không phải do tài liệu của bạn.';

export function firstRenderError(log: string): string {
  const line = log.split('\n').find((row) => row.trimStart().startsWith('!'));
  if (!line) return 'Không tạo được PDF từ mẫu này.';
  return line.trim().replace(/^!\s*/, '');
}

export function countPages(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

export function sandboxReason(error: SandboxError): string {
  switch (error.kind) {
    case 'TIMEOUT':
      return 'Quá thời gian khi tạo PDF. Hãy thử lại; nếu vẫn vậy thì tài liệu có thể quá dài.';
    case 'RUNTIME_UNAVAILABLE':
      return PDF_UNAVAILABLE;
    case 'IMAGE_MISSING':
      return 'Máy chủ chưa có bộ công cụ in PDF. Người vận hành cần build ảnh aijob-pdf trước.';
    default:
      return 'Không tạo được PDF.';
  }
}
