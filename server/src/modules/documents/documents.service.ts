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
} from '../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DocumentComposer } from './document-composer.service.js';
import { DocumentRenderer, isPrintable } from './document-renderer.service.js';
import type { Identity } from './latex.js';
import {
  emailTitle,
  letterTarget,
  type DocumentParams,
} from './letter-target.js';

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

  /** Compile tài liệu ra PDF và trả về bytes. */
  async pdf(userId: string, id: string): Promise<Buffer> {
    const tex = await this.source(userId, id);
    return this.renderer.toPdf(tex, id);
  }
}
