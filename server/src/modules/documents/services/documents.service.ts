import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  Document,
  DocumentKind,
  DocumentLanguage,
  Prisma,
} from '@/generated/prisma/client';
import type { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { pageArgs, pageOf } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import { DocumentGenerator } from './document-generator.service';
import { DocumentRenderer } from './document-renderer.service';
import { emailTitle } from '../utils/letter-target';
import {
  parseCvEdit,
  parseIdentityEdit,
  parseLayoutEdit,
  requirePastedJob,
} from '../utils/document-input';
import { isTemplateId, resolveTemplateOptions } from '../templates/registry';
import type {
  CreateApplicationEmailDto,
  PreviewBodyDto,
  SetTemplateDto,
  UpdateCvDto,
} from '../documents.dto';

const JOB_SUMMARY = {
  id: true,
  title: true,
  company: true,
  companyLogo: true,
} as const;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: DocumentGenerator,
    private readonly renderer: DocumentRenderer,
  ) {}

  private async requireJob(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, company: true },
    });
    if (!job)
      throw new NotFoundException(`Không tìm thấy tin tuyển dụng: ${jobId}`);
    return job;
  }

  async createApplicationEmail(
    userId: string,
    input: CreateApplicationEmailDto,
  ): Promise<Document> {
    if (input.jobId) {
      const job = await this.requireJob(input.jobId);
      return this.create(
        userId,
        'APPLICATION_EMAIL',
        emailTitle(job.title, job.company),
        job.id,
      );
    }

    const pasted = requirePastedJob(input);

    return this.create(
      userId,
      'APPLICATION_EMAIL',
      emailTitle(pasted.title, pasted.company),
      undefined,
      pasted,
    );
  }

  async createCv(
    userId: string,
    input: {
      jobId?: string;
      jobDescription?: string;
      company?: string;
      title?: string;
      language?: DocumentLanguage;
    },
  ): Promise<Document> {
    if (input.jobId) {
      const job = await this.requireJob(input.jobId);
      return this.create(userId, 'CV', '', job.id, undefined, input.language);
    }

    const touched =
      input.jobDescription !== undefined ||
      input.company !== undefined ||
      input.title !== undefined;

    return this.create(
      userId,
      'CV',
      '',
      undefined,
      touched ? requirePastedJob(input) : undefined,
      input.language,
    );
  }

  create(
    userId: string,
    kind: DocumentKind,
    title: string,
    jobId?: string,
    params?: Prisma.InputJsonValue,
    language?: DocumentLanguage,
  ) {
    return this.prisma.document.create({
      data: {
        userId,
        kind,
        title,
        jobId: jobId ?? null,
        content: params ?? undefined,
        language,
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
          jobId: true,
          kind: true,
          status: true,
          title: true,
          templateId: true,
          templateOptions: true,
          language: true,
          createdAt: true,
          generatedAt: true,
          error: true,
          job: { select: JOB_SUMMARY },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return pageOf(items, total, query);
  }

  async get(userId: string, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, userId },
      include: { job: { select: JOB_SUMMARY } },
    });
    if (!document)
      throw new NotFoundException(`Không tìm thấy tài liệu: ${id}`);
    return document;
  }

  async setTemplate(
    userId: string,
    id: string,
    templateId: string,
    options: SetTemplateDto,
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
      where: { id, userId },
      data: {
        templateId,
        templateOptions: resolveTemplateOptions(templateId, options),
      },
    });
  }

  async updateCv(
    userId: string,
    id: string,
    input: UpdateCvDto,
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
        : parseLayoutEdit(input.layout);

    const data: Prisma.DocumentUpdateInput = {
      content: content as Prisma.InputJsonValue,
      layout: layout as Prisma.InputJsonValue,
    };
    if (input.identity !== undefined) {
      data.identity = parseIdentityEdit(input.identity);
    }

    return this.prisma.document.update({
      where: { id, userId },
      data,
    });
  }

  /** HTML cho khung xem trước; `override` cho thử mẫu khác mà không ghi database. */
  async previewHtml(
    userId: string,
    id: string,
    override?: PreviewBodyDto,
  ): Promise<string> {
    const document = await this.get(userId, id);

    if (document.status !== 'DONE' || !document.content) {
      throw new UnprocessableEntityException(
        `Tài liệu đang ở trạng thái ${document.status} và chưa có nội dung để xem trước.`,
      );
    }

    const style = await this.styleOf(document);
    const previewed = {
      ...document,
      templateId: override?.templateId ?? style.templateId,
      templateOptions: override?.templateId
        ? {
            accent: override.accent,
            font: override.font,
            size: override.size,
            lineHeight: override.lineHeight,
          }
        : style.templateOptions,
      layout: override?.layout ?? document.layout,
      identity:
        override?.identity === undefined
          ? document.identity
          : parseIdentityEdit(override.identity),
    };
    const { identity, target } = await this.generator.context(previewed);

    const content =
      override?.content === undefined
        ? document.content
        : parseCvEdit(override.content);
    const editing =
      override?.editing === true && override.content !== undefined;

    const html = this.renderer.toHtml(
      previewed,
      content,
      identity,
      target,
      editing,
    );

    if (!html) {
      throw new UnprocessableEntityException(
        `Tài liệu loại ${document.kind} chưa có mẫu HTML để xem trước.`,
      );
    }

    return html;
  }

  async pdf(userId: string, id: string) {
    const html = await this.previewHtml(userId, id);
    return this.renderer.htmlToPdf(html, id);
  }

  private async styleOf(
    document: Document,
  ): Promise<Pick<Document, 'templateId' | 'templateOptions'>> {
    if (document.kind !== 'COVER_LETTER' || !document.jobId) return document;
    const cv = await this.prisma.document.findFirst({
      where: {
        userId: document.userId,
        jobId: document.jobId,
        kind: 'CV',
        status: 'DONE',
      },
      orderBy: { updatedAt: 'desc' },
      select: { templateId: true, templateOptions: true },
    });
    return cv ?? document;
  }
}
