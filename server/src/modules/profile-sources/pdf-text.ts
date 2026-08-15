import { PDFParse } from 'pdf-parse';

/** Rút lớp text của một file PDF. */

/** Kích thước file lớn nhất nhận vào. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Số trang lớn nhất được đọc. */
export const MAX_PDF_PAGES = 10;

/** Dưới ngưỡng này thì coi như KHÔNG có lớp text. */
export const MIN_CHARS_PER_PAGE = 120;

export type PdfTextResult = {
  /**
   * Text đã ghép của các trang đọc được. Là dữ liệu KHÔNG TIN CẬY: nó do người
   * dùng nộp lên và sẽ đi vào prompt. Xem `cv-pdf.source.ts`.
   */
  text: string;
  /** Tổng số trang của tài liệu, kể cả phần bị `MAX_PDF_PAGES` cắt. */
  pages: number;
  /** Số trang thực sự đã đọc. */
  pagesRead: number;
  /** false nghĩa là PDF scan (ảnh), cần đường vision thay vì đường text. */
  hasTextLayer: boolean;
};

export type PdfErrorKind =
  /** File không phải PDF, hoặc hỏng. */
  | 'INVALID'
  /** PDF có mật khẩu. */
  | 'ENCRYPTED'
  /** Vượt `MAX_PDF_BYTES`. */
  | 'TOO_LARGE'
  | 'OTHER';

export class PdfExtractError extends Error {
  constructor(
    readonly kind: PdfErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'PdfExtractError';
  }
}

/** Phân loại lỗi của pdfjs theo TÊN LỚP, không theo nội dung thông báo. */
function classifyPdfError(error: unknown): PdfErrorKind {
  const name = (error as { name?: string })?.name ?? '';
  const message = error instanceof Error ? error.message : String(error);

  if (name === 'PasswordException') return 'ENCRYPTED';
  if (name === 'InvalidPDFException') return 'INVALID';
  if (/password/i.test(message)) return 'ENCRYPTED';
  if (/invalid pdf|no pdf header|structure/i.test(message)) return 'INVALID';
  return 'OTHER';
}

/** Đọc lớp text của PDF. */
export async function extractPdfText(data: Buffer): Promise<PdfTextResult> {
  if (data.byteLength > MAX_PDF_BYTES) {
    throw new PdfExtractError(
      'TOO_LARGE',
      `File ${Math.round(data.byteLength / 1024 / 1024)}MB, vượt giới hạn ${MAX_PDF_BYTES / 1024 / 1024}MB`,
    );
  }

  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText({ last: MAX_PDF_PAGES });

    const pages = result.total;
    const pagesRead = Math.min(pages, MAX_PDF_PAGES);
    const text = (result.text ?? '').trim();

    return {
      text,
      pages,
      pagesRead,
      hasTextLayer:
        pagesRead > 0 && text.length / pagesRead >= MIN_CHARS_PER_PAGE,
    };
  } catch (error) {
    throw new PdfExtractError(
      classifyPdfError(error),
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await parser.destroy();
  }
}
