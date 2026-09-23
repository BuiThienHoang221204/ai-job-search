import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Document } from '../../../generated/prisma/client.js';
import {
  STORAGE,
  userKey,
  type Storage,
} from '../../storage/storage.interface.js';
import type { Identity } from '../content.types.js';
import type { CoverLetterResult } from '../schemas/document.schema.js';
import { renderCoverLetter, renderCv, slugify } from '../templates/latex.js';
import type { LetterTarget } from '../utils/letter-target.js';
import {
  EXPECTED_MAX_PAGES,
  LATEX_COMPILER,
  PDF_RENDERER,
  type LatexCompiler,
  type PdfRenderer,
} from '../pdf/seam.js';
import { renderCvHtml } from '../templates/registry.js';
import { cvContent, renderLanguage } from '../utils/cv-content.js';

/** Nội dung đã soạn → `.tex` trong Storage → PDF. KHÔNG gọi model, chạy lại bao nhiêu lần cũng miễn phí. */
@Injectable()
export class DocumentRenderer {
  private readonly logger = new Logger(DocumentRenderer.name);

  constructor(
    @Inject(STORAGE) private readonly storage: Storage,
    @Inject(LATEX_COMPILER) private readonly latex: LatexCompiler,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRenderer,
  ) {}

  /** Trả `null` với loại không in được chứ không ném lỗi — đường sinh gọi hàm này cho MỌI loại; ai cần chặt thì kiểm `isPrintable` trước. */
  async render(
    document: Document,
    target: LetterTarget | null,
    content: unknown,
    identity: Identity,
  ): Promise<string | null> {
    if (document.kind === 'CV') {
      const tex = renderCv(
        identity,
        cvContent(content),
        renderLanguage(document),
      );

      const key = userKey(
        document.userId,
        'cv',
        `main_${slugify(target ? `${target.company}_${target.title}` : 'tong-quat')}.tex`,
      );
      await this.storage.write(key, tex);
      return key;
    }

    if (document.kind === 'COVER_LETTER') {
      if (!target) {
        throw new NotFoundException(
          'Thư xin việc bắt buộc phải gắn với một công việc',
        );
      }
      const tex = renderCoverLetter(
        identity,
        target.company,
        target.title,
        content as CoverLetterResult,
      );

      const key = userKey(
        document.userId,
        'cover_letters',
        `cover_${slugify(`${target.company}_${target.title}`)}.tex`,
      );
      await this.storage.write(key, tex);
      return key;
    }

    return null;
  }

  /** Khoá luôn bắt đầu bằng `userId` nên không thể đọc chéo workspace của người khác. */
  readSource(storageKey: string): Promise<string> {
    return this.storage.readText(storageKey);
  }

  /** Compile `.tex` ra PDF. `label` chỉ dùng để ghi log, không vào file. */
  async toPdf(tex: string, label: string): Promise<Buffer> {
    const result = await this.latex.compile(tex);

    if (!result.ok) {
      throw new UnprocessableEntityException(result.reason);
    }

    if (result.warnings.length > 0) {
      this.logger.warn(
        `PDF ${label} thiếu ${result.warnings.length} ký tự font: ${result.warnings.join(', ')}`,
      );
    }

    return result.pdf;
  }

  /** KHÔNG ghi Storage vì sinh lại từ `content` chỉ mất vài mili giây; `null` với loại chưa có mẫu HTML. */
  toHtml(
    document: Document,
    content: unknown,
    identity: Identity,
  ): string | null {
    if (document.kind !== 'CV') return null;
    return renderCvHtml(
      identity,
      cvContent(content),
      document.templateId,
      document.templateOptions,
      document.layout,
      renderLanguage(document),
    );
  }

  /** In HTML ra PDF. `label` chỉ dùng để ghi log, không vào file. */
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
