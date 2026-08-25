import { Injectable } from '@nestjs/common';
import type { Evidence, ProfileSource } from './evidence.js';
import { extractPdfText, PdfExtractError } from './pdf-text.js';

/** Đầu vào của nguồn CV PDF. */
export type CvPdfInput = {
  data: Buffer;
  filename: string;
};

/** Số ký tự tối đa của text đưa vào prompt tổng hợp. */
export const MAX_EVIDENCE_CHARS = 40_000;

/** Áp giới hạn độ dài lên text bằng chứng. */
export function boundEvidenceText(text: string): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= MAX_EVIDENCE_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_EVIDENCE_CHARS), truncated: true };
}

/** Ném khi PDF là bản scan (không có lớp text). */
export class ScannedPdfError extends Error {
  constructor() {
    super(
      'PDF này không có lớp text nên gần như chắc chắn là bản scan hoặc ảnh chụp',
    );
    this.name = 'ScannedPdfError';
  }
}

/** SEAM 3 · adapter thứ nhất — đọc lớp text của CV PDF. */
@Injectable()
export class CvPdfSource implements ProfileSource<CvPdfInput> {
  readonly kind = 'CV_PDF_TEXT' as const;

  async collect({ data, filename }: CvPdfInput): Promise<Evidence[]> {
    const result = await extractPdfText(data);

    if (!result.hasTextLayer) throw new ScannedPdfError();

    const { text, truncated } = boundEvidenceText(result.text);

    return [
      {
        kind: this.kind,
        label: filename,
        text,
        meta: {
          pages: result.pages,
          pagesRead: result.pagesRead,
          chars: result.text.length,
          truncated,
          bytes: data.byteLength,
        },
      },
    ];
  }
}

/** Gom `PdfExtractError` và `ScannedPdfError` về một câu cho người dùng. */
export function cvPdfErrorMessage(error: unknown): string | null {
  if (error instanceof ScannedPdfError) {
    return 'File này là bản scan hoặc ảnh chụp, chưa đọc được. Hãy nộp bản PDF xuất trực tiếp từ Word, LaTeX hoặc Canva.';
  }
  if (!(error instanceof PdfExtractError)) return null;

  switch (error.kind) {
    case 'ENCRYPTED':
      return 'File PDF này có mật khẩu. Hãy bỏ mật khẩu rồi nộp lại.';
    case 'INVALID':
      return 'File không phải PDF hợp lệ, hoặc đã bị hỏng trong lúc tải lên.';
    case 'TOO_LARGE':
      return 'File quá lớn. Giới hạn là 10MB — một CV có lớp text thường dưới 2MB.';
    default:
      return 'Không đọc được file PDF này.';
  }
}
