import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  Document,
  DocumentKind,
  Prisma,
} from '../../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../../common/pagination.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DocumentComposer } from './document-composer.service.js';
import { DocumentRenderer, isPrintable } from './document-renderer.service.js';
import type { Identity } from '../content.types.js';
import {
  emailTitle,
  letterTarget,
  type DocumentParams,
} from '../letter-target.js';
import { cvEditSchema, type CvEditResult } from '../document.schema.js';
import { resolveLayout } from '../templates/cv-layout.js';
import { isTemplateId, resolveTemplateOptions } from '../templates/registry.js';

/**
 * Đường sinh PDF. `latex` đi qua file `.tex` đã lưu, `html` dựng thẳng từ
 * `Document.content`. Xem `DocumentsService.pdf` để biết vì sao có hai đường.
 */
export type PdfEngine = 'latex' | 'html';

/**
 * Kiểm nội dung CV người dùng gửi lên, đổi lỗi zod thành 400 kèm câu tiếng Việt.
 *
 * Để `parse` ném thẳng thì Nest trả 500 - một lỗi nhập liệu bình thường bị báo như
 * sự cố máy chủ, và giao diện không có gì để hiện cho người dùng sửa.
 */
const parseCvEdit = (raw: unknown): CvEditResult => {
  const parsed = cvEditSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const detail = parsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'nội dung'}: ${issue.message}`)
    .join('; ');

  throw new BadRequestException(`Nội dung CV không hợp lệ — ${detail}`);
};

/**
 * Điều phối vòng đời một tài liệu, và không tự làm phần nào trong đó.
 *
 * Ba việc tách hẳn nhau: `DocumentComposer` chạm model, `DocumentRenderer`
 * chạm LaTeX và Storage, còn lớp này giữ máy trạng thái, quyền sở hữu và
 * đường đọc. Chúng KHÔNG phải seam - mỗi thứ chỉ có một bản cài, nên đây là
 * lớp thường chứ không phải interface kèm token DI.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly composer: DocumentComposer,
    private readonly renderer: DocumentRenderer,
  ) {}

  /**
   * Mọi thứ một lượt soạn thảo cần tra trước, trong đúng một lượt đi database.
   *
   * Gom ở đây thay vì để composer và renderer tự tra: cả hai đều cần `identity`
   * và `target`, nên tra riêng là hai lần đọc cùng một hàng.
   */
  private async context(document: Document) {
    const [user, profile, job] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: document.userId },
        select: { name: true, email: true },
      }),
      this.prisma.profile.findUnique({ where: { userId: document.userId } }),
      document.jobId
        ? this.prisma.job.findUnique({ where: { id: document.jobId } })
        : Promise.resolve(null),
    ]);

    const identity: Identity = {
      name: user.name,
      email: user.email,
      location: profile?.location ?? null,
      title: profile?.headline ?? null,
      // `Profile.phone` được thêm về sau, còn chỗ này thì kẹt ở `null` - nên CV
      // và chữ ký mail đều thiếu số điện thoại dù hồ sơ đã khai.
      phone: profile?.phone ?? null,
    };

    const params = (document.content ?? {}) as DocumentParams;
    return { profile, target: letterTarget(job, params), params, identity };
  }

  /** Sinh nội dung cho một tài liệu đã tạo. */
  async generate(userId: string, documentId: string): Promise<Document> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
    });
    if (!document)
      throw new NotFoundException(`Không tìm thấy tài liệu: ${documentId}`);

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'RUNNING', error: null },
    });

    try {
      const { profile, target, params, identity } =
        await this.context(document);

      const { content, modelId } = await this.composer.compose({
        document,
        profile,
        target,
        params,
        identity,
      });

      const storageKey = await this.renderer.render(
        document,
        target,
        content,
        identity,
      );

      return await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'DONE',
          content: content as Prisma.InputJsonValue,
          storageKey,
          modelId,
          generatedAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sinh tài liệu thất bại (${documentId}): ${message}`);
      return this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  /** Render lại `.tex` từ `content` đã lưu, KHÔNG gọi model. */
  async rerender(userId: string, documentId: string): Promise<Document> {
    const document = await this.get(userId, documentId);

    if (document.status !== 'DONE' || !document.content) {
      throw new UnprocessableEntityException(
        `Tài liệu đang ở trạng thái ${document.status} và chưa có nội dung để render lại.`,
      );
    }

    if (!isPrintable(document.kind)) {
      throw new UnprocessableEntityException(
        `Tài liệu loại ${document.kind} không có bản LaTeX để render lại.`,
      );
    }

    const { target, identity } = await this.context(document);
    const storageKey = await this.renderer.render(
      document,
      target,
      document.content,
      identity,
    );

    return this.prisma.document.update({
      where: { id: documentId },
      data: { storageKey },
    });
  }

  /**
   * Tạo bản ghi mail ứng tuyển từ MỘT trong hai nguồn: một tin đã có trong hệ
   * thống, hoặc một mô tả công việc người dùng dán tay.
   *
   * JD dán tay cố ý KHÔNG được lưu thành `Job`. Bảng đó là kho dùng chung và
   * không có cột chủ sở hữu, nên một tin dán tay sẽ hiện trong danh sách việc
   * làm của MỌI người dùng. Nó nằm tạm trong `Document.content` cho tới khi
   * worker đọc ra, đúng cách `FORM_ANSWER` mang câu hỏi của mình.
   */
  async createApplicationEmail(
    userId: string,
    input: {
      jobId?: string;
      jobDescription?: string;
      company?: string;
      title?: string;
    },
  ): Promise<Document> {
    if (input.jobId) {
      const job = await this.prisma.job.findUnique({
        where: { id: input.jobId },
        select: { id: true, title: true, company: true },
      });
      if (!job) {
        throw new NotFoundException(
          `Không tìm thấy tin tuyển dụng: ${input.jobId}`,
        );
      }
      return this.create(
        userId,
        'APPLICATION_EMAIL',
        emailTitle(job.title, job.company),
        job.id,
      );
    }

    const { jobDescription, company, title } = input;
    // DTO đã chặn trường hợp này; kiểm lại ở đây để service tự đứng vững khi có
    // caller thứ hai, và để TypeScript thu hẹp được kiểu ngay bên dưới.
    if (!jobDescription || !company || !title) {
      throw new BadRequestException(
        'Cần chọn một tin tuyển dụng, hoặc dán mô tả công việc kèm tên công ty và vị trí',
      );
    }

    return this.create(
      userId,
      'APPLICATION_EMAIL',
      emailTitle(title, company),
      undefined,
      { jobDescription, company, title },
    );
  }

  create(
    userId: string,
    kind: DocumentKind,
    title: string,
    jobId?: string,
    params?: Prisma.InputJsonValue,
  ) {
    return this.prisma.document.create({
      data: {
        userId,
        kind,
        title,
        jobId: jobId ?? null,
        content: params ?? undefined,
      },
    });
  }

  async list(
    userId: string,
    kind: DocumentKind | undefined,
    jobId: string | undefined,
    query: PaginationQueryDto,
  ) {
    const where = {
      userId,
      ...(kind ? { kind } : {}),
      ...(jobId ? { jobId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        select: {
          id: true,
          kind: true,
          status: true,
          title: true,
          storageKey: true,
          createdAt: true,
          generatedAt: true,
          error: true,
          job: { select: { id: true, title: true, company: true } },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return pageOf(items, total, query);
  }

  async get(userId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, userId },
      include: { job: { select: { id: true, title: true, company: true } } },
    });
    if (!document)
      throw new NotFoundException(`Không tìm thấy tài liệu: ${id}`);
    return document;
  }

  /** Đọc file `.tex`. `get` đã khoá theo `userId` nên không đọc chéo được. */
  async source(userId: string, id: string): Promise<string> {
    const document = await this.get(userId, id);
    if (!document.storageKey) {
      throw new NotFoundException('Tài liệu này không có file nguồn');
    }
    return this.renderer.readSource(document.storageKey);
  }

  /**
   * Đổi mẫu trình bày của một CV. KHÔNG gọi model. `templateId` lạ bị từ chối ở đây
   * vì người dùng đang chốt lựa chọn, khác với đường đọc của `registry`.
   */
  async setTemplate(
    userId: string,
    id: string,
    templateId: string,
    accent?: string,
  ): Promise<Document> {
    const document = await this.get(userId, id);

    if (document.kind !== 'CV') {
      throw new UnprocessableEntityException(
        `Tài liệu loại ${document.kind} không có mẫu trình bày để đổi.`,
      );
    }

    if (!isTemplateId(templateId)) {
      throw new BadRequestException(`Không có mẫu CV nào tên "${templateId}"`);
    }

    return this.prisma.document.update({
      where: { id },
      data: {
        templateId,
        templateOptions: resolveTemplateOptions(templateId, { accent }),
      },
    });
  }

  /**
   * Lưu bản CV người dùng đã sửa: chữ, thứ tự mục, mục bị ẩn.
   *
   * KHÔNG gọi model. Bấm "Tạo CV bằng AI" lần nữa sinh ra một tài liệu MỚI chứ
   * không đè lên đây, nên công sửa tay không bao giờ bị mất.
   */
  async updateCv(
    userId: string,
    id: string,
    input: { content?: unknown; layout?: unknown },
  ): Promise<Document> {
    const document = await this.get(userId, id);

    if (document.kind !== 'CV') {
      throw new UnprocessableEntityException(
        `Tài liệu loại ${document.kind} chưa sửa được bằng đường này.`,
      );
    }
    if (document.status !== 'DONE') {
      throw new UnprocessableEntityException(
        `Tài liệu đang ở trạng thái ${document.status} và chưa có nội dung để sửa.`,
      );
    }

    const content =
      input.content === undefined
        ? document.content
        : parseCvEdit(input.content);

    const layout =
      input.layout === undefined
        ? document.layout
        : resolveLayout(input.layout);

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        content: content as Prisma.InputJsonValue,
        layout: layout as Prisma.InputJsonValue,
      },
    });

    // Sửa chữ xong mà không render lại thì file `.tex` đã lưu thành cũ, trong khi
    // nút "Xem mã .tex" và đường PDF LaTeX vẫn đọc đúng file đó.
    const { target, identity } = await this.context(updated);
    const storageKey = await this.renderer.render(
      updated,
      target,
      content,
      identity,
    );

    return this.prisma.document.update({
      where: { id },
      data: { storageKey },
    });
  }

  /**
   * Bản HTML của một CV để nhúng vào khung xem trước. Sinh lại từ `content` mỗi lần
   * gọi và KHÔNG gọi model. `override` cho xem thử mẫu khác mà không ghi database.
   */
  async previewHtml(
    userId: string,
    id: string,
    override?: {
      templateId?: string;
      accent?: string;
      content?: unknown;
      layout?: unknown;
    },
  ): Promise<string> {
    const document = await this.get(userId, id);

    if (document.status !== 'DONE' || !document.content) {
      throw new UnprocessableEntityException(
        `Tài liệu đang ở trạng thái ${document.status} và chưa có nội dung để xem trước.`,
      );
    }

    const { identity } = await this.context(document);

    // Bản nháp CHƯA lưu vẫn xem trước được: đây là thứ cho phép vừa gõ vừa thấy
    // kết quả mà không ghi database sau mỗi phím.
    const previewed = {
      ...document,
      templateId: override?.templateId ?? document.templateId,
      templateOptions: override?.templateId
        ? { accent: override.accent }
        : document.templateOptions,
      layout: override?.layout ?? document.layout,
    };

    const content =
      override?.content === undefined
        ? document.content
        : parseCvEdit(override.content);

    const html = this.renderer.toHtml(previewed, content, identity);

    if (!html) {
      throw new UnprocessableEntityException(
        `Tài liệu loại ${document.kind} chưa có mẫu HTML để xem trước.`,
      );
    }

    return html;
  }

  /**
   * Tạo PDF và trả về bytes. `latex` đi qua file `.tex` đã lưu, `html` dựng thẳng từ
   * `content`. Hai đường cùng tồn tại là TẠM THỜI, để đối chiếu trong lúc chuyển đổi.
   */
  async pdf(userId: string, id: string, engine: PdfEngine = 'latex') {
    if (engine === 'html') {
      const html = await this.previewHtml(userId, id);
      return this.renderer.htmlToPdf(html, id);
    }

    const tex = await this.source(userId, id);
    return this.renderer.toPdf(tex, id);
  }
}
