import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Document } from '@/generated/prisma/client';
import type { CoverLetterContent, CvContent, Identity } from '../content.types';
import type { LetterTarget } from '../utils/letter-target';
import {
  EXPECTED_MAX_PAGES,
  PDF_RENDERER,
  type PdfRenderer,
} from '../pdf/seam';
import { renderCvHtml, renderLetterHtml } from '../templates/registry';
import { cvContent, renderLanguage } from '../utils/cv-content';

@Injectable()
export class DocumentRenderer {
  private readonly logger = new Logger(DocumentRenderer.name);

  constructor(
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRenderer,
  ) {}

  toHtml(
    document: Document,
    content: unknown,
    identity: Identity,
    target: LetterTarget | null,
    editing = false,
  ): string | null {
    if (document.kind === 'COVER_LETTER') {
      if (!target) {
        throw new NotFoundException(
          'Thư xin việc bắt buộc phải gắn với một công việc',
        );
      }
      return renderLetterHtml(
        identity,
        target.company,
        target.title,
        content as CoverLetterContent,
        document.templateId,
        document.templateOptions,
      );
    }

    if (document.kind !== 'CV') return null;
    return renderCvHtml(
      identity,
      editing ? (content as CvContent) : cvContent(content),
      document.templateId,
      document.templateOptions,
      document.layout,
      renderLanguage(document),
      editing,
    );
  }

  async htmlToPdf(html: string, label: string): Promise<Buffer> {
    const result = await this.pdfRenderer.render(html);

    if (!result.ok) {
      this.logger.error(`In PDF ${label} thất bại: ${result.log}`);
      throw new UnprocessableEntityException(result.reason);
    }

    if (result.pages > EXPECTED_MAX_PAGES) {
      this.logger.warn(
        `PDF ${label} dài ${result.pages} trang, vượt mức ${EXPECTED_MAX_PAGES} trang thường gặp - nhiều khả năng mẫu để chữ tràn khung.`,
      );
    }

    return result.pdf;
  }
}
