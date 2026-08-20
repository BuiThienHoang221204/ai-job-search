import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Document, DocumentKind } from '../../generated/prisma/client.js';
import {
  STORAGE,
  userKey,
  type Storage,
} from '../storage/storage.interface.js';
import type { CoverLetterResult, CvContentResult } from './document.schema.js';
import { LATEX_COMPILER, type LatexCompiler } from './latex-compile.js';
import {
  renderCoverLetter,
  renderCv,
  slugify,
  type Identity,
} from './latex.js';
import type { LetterTarget } from './letter-target.js';

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
      const cv = content as CvContentResult;
      const tex = renderCv(identity, {
        ...cv,
        experiences: cv.experiences.map((experience) => ({
          ...experience,
          location: experience.location ?? '',
        })),
        educations: cv.educations.map((education) => ({
          ...education,
          period: education.period ?? '',
          detail: education.detail ?? '',
        })),
      });

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
}
