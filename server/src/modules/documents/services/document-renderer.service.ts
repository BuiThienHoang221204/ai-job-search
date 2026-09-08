import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  Document,
  DocumentKind,
} from '../../../generated/prisma/client.js';
import {
  STORAGE,
  userKey,
  type Storage,
} from '../../storage/storage.interface.js';
import type { CvContent, Identity } from '../content.types.js';
import type { CoverLetterResult, CvContentResult } from '../document.schema.js';
import { LATEX_COMPILER, type LatexCompiler } from '../latex-compile.js';
import { renderCoverLetter, renderCv, slugify } from '../latex.js';
import type { LetterTarget } from '../letter-target.js';
import {
  EXPECTED_MAX_PAGES,
  PDF_RENDERER,
  type PdfRenderer,
} from '../pdf-render.js';
import { renderCvHtml } from '../templates/registry.js';
import type { DocumentLanguage } from '../templates/cv-layout.js';

/**
 * Loại tài liệu có bản LaTeX để in ra.
 *
 * Trước khi tách, quy tắc này tồn tại dưới dạng hai chỗ viết cứng
 * `storageKey: null` nằm cách nhau 160 dòng, nên "mail ứng tuyển có in được
 * không" là câu chỉ trả lời được bằng cách đọc cả bốn hàm sinh nội dung.
 */
const PRINTABLE: readonly DocumentKind[] = ['CV', 'COVER_LETTER'];

export const isPrintable = (kind: DocumentKind): boolean =>
  PRINTABLE.includes(kind);

const renderLanguage = (document: Document): DocumentLanguage =>
  document.language === 'EN' ? 'en' : 'vi';

const hasText = (...parts: Array<string | null | undefined>): boolean =>
  parts.some((part) => (part ?? '').trim().length > 0);

/**
 * Điền trường tuỳ chọn model được phép bỏ trống, và BỎ QUA dòng chưa có gì.
 *
 * Dòng rỗng là chuyện bình thường: bấm "Thêm kinh nghiệm" sinh ra một dòng trống
 * chờ người dùng gõ vào. Nó được LƯU (để họ quay lại vẫn thấy) nhưng không được vẽ
 * ra CV - một khối kinh nghiệm không có chữ nào đọc như lỗi trình bày.
 *
 * Lọc ở đây chứ không ở từng mẫu: cả đường HTML lẫn đường LaTeX đều đi qua hàm này.
 */
const cvContent = (content: unknown): CvContent => {
  const cv = content as CvContentResult;
  return {
    ...cv,
    experiences: cv.experiences
      .map((experience) => ({
        ...experience,
        location: experience.location ?? '',
      }))
      .filter(
        (experience) =>
          hasText(experience.position, experience.company) ||
          experience.bullets.length > 0,
      ),
    projects: (cv.projects ?? [])
      .map((project) => ({
        ...project,
        role: project.role ?? '',
        organization: project.organization ?? '',
        period: project.period ?? '',
        description: project.description ?? '',
        bullets: project.bullets ?? [],
        tools: project.tools ?? [],
      }))
      .filter(
        (project) =>
          hasText(project.name, project.organization) ||
          project.bullets.length > 0,
      ),
    educations: cv.educations
      .map((education) => ({
        ...education,
        period: education.period ?? '',
        detail: education.detail ?? '',
      }))
      .filter((education) => hasText(education.degree, education.institution)),
    skillGroups: cv.skillGroups.filter(
      (group) => hasText(group.label) || group.items.length > 0,
    ),
  };
};

/**
 * Biến nội dung đã soạn thành file `.tex` trong Storage, và thành PDF khi được
 * hỏi tới. **KHÔNG gọi model** - mọi hàm ở đây chạy lại bao nhiêu lần cũng
 * không tốn một lượt gọi nào.
 */
@Injectable()
export class DocumentRenderer {
  private readonly logger = new Logger(DocumentRenderer.name);

  constructor(
    @Inject(STORAGE) private readonly storage: Storage,
    @Inject(LATEX_COMPILER) private readonly latex: LatexCompiler,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRenderer,
  ) {}

  /**
   * Render `content` thành `.tex` rồi ghi vào Storage.
   *
   * Trả `null` với loại tài liệu không in được, thay vì ném lỗi: đường sinh nội
   * dung gọi hàm này cho MỌI loại, nên "không có gì để render" là kết quả bình
   * thường chứ không phải sự cố. Caller nào coi đó là lỗi thì tự kiểm bằng
   * `isPrintable` trước khi gọi.
   */
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

  /**
   * Đọc file `.tex` từ Storage. Khóa luôn bắt đầu bằng userId nên không thể đọc
   * chéo workspace của người khác.
   */
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

  /**
   * Render CV thành HTML tự chứa. KHÔNG ghi Storage: sinh lại từ `content` trong
   * vài mili giây. Trả `null` với loại chưa có mẫu HTML (thư xin việc).
   */
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
