export const PDF_RENDERER = Symbol('PDF_RENDERER');

export type PdfRenderResult =
  | { ok: true; pdf: Buffer; pages: number }
  | { ok: false; reason: string; log: string };

/** Biến một tài liệu HTML tự chứa thành PDF. */
export interface PdfRenderer {
  render(html: string): Promise<PdfRenderResult>;
  /** Môi trường in có dùng được hay không. `/ready` đọc cái này. */
  available(): Promise<boolean>;
}

/**
 * Ngưỡng CẢNH BÁO độ dài CV, không phải ngưỡng từ chối. Vượt quá gần như luôn là
 * lỗi trình bày chứ không phải người dùng có quá nhiều kinh nghiệm.
 */
export const EXPECTED_MAX_PAGES = 2;

/**
 * Rút một câu đọc được từ log của Chromium. Chỉ nhặt dòng `!` do `pdf-service` tự
 * viết: stderr của Chromium đầy cảnh báo GPU ngay cả trong lượt in thành công.
 */
export function firstRenderError(log: string): string {
  const line = log.split('\n').find((row) => row.trimStart().startsWith('!'));
  if (line) return line.trim().replace(/^!\s*/, '');
  return 'Không tạo được PDF từ mẫu CV này.';
}
