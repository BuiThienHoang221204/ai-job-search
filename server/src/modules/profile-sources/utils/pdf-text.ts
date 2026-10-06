import { PDFParse } from 'pdf-parse';
import { messageOf } from '@/common/error-message';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export const MAX_PDF_PAGES = 10;

export const MIN_CHARS_PER_PAGE = 120;

export type PdfTextResult = {
  text: string;
  pages: number;
  pagesRead: number;
  hasTextLayer: boolean;
};

export type PdfErrorKind = 'INVALID' | 'ENCRYPTED' | 'TOO_LARGE' | 'OTHER';

export class PdfExtractError extends Error {
  constructor(
    readonly kind: PdfErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'PdfExtractError';
  }
}

function classifyPdfError(error: unknown): PdfErrorKind {
  const name = (error as { name?: string })?.name ?? '';
  const message = messageOf(error);

  if (name === 'PasswordException') return 'ENCRYPTED';
  if (name === 'InvalidPDFException') return 'INVALID';
  if (/password/i.test(message)) return 'ENCRYPTED';
  if (/invalid pdf|no pdf header|structure/i.test(message)) return 'INVALID';
  return 'OTHER';
}

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
    throw new PdfExtractError(classifyPdfError(error), messageOf(error));
  } finally {
    await parser.destroy();
  }
}
