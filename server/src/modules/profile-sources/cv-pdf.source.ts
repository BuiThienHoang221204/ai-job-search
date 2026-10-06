import { Injectable } from '@nestjs/common';
import type { Evidence, ProfileSource } from './utils/evidence';
import { extractPdfText, PdfExtractError } from './utils/pdf-text';

export type CvPdfInput = {
  data: Buffer;
  filename: string;
};

export const MAX_EVIDENCE_CHARS = 40_000;

export function boundEvidenceText(text: string): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= MAX_EVIDENCE_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_EVIDENCE_CHARS), truncated: true };
}

export class ScannedPdfError extends Error {
  constructor() {
    super(
      'PDF này không có lớp text nên gần như chắc chắn là bản scan hoặc ảnh chụp',
    );
    this.name = 'ScannedPdfError';
  }
}

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
