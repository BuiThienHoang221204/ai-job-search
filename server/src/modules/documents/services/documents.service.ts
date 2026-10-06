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
import { isPrintable } from '../utils/cv-content';
import { parseCvEdit, requirePastedJob } from '../utils/document-input';
import { resolveLayout } from '../templates/cv-layout';
import { isTemplateId, resolveTemplateOptions } from '../templates/registry';

export type PdfEngine = 'latex' | 'html';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: DocumentGenerator,
    private readonly renderer: DocumentRenderer,
  ) {}

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

    return this.writeSource(document, document.content);
  }

  /** Vẽ lại file nguồn từ `content` rồi ghi `storageKey` — quên bước này thì PDF LaTeX còn chữ cũ. */
  private async writeSource(
    document: Document,
    content: unknown,
  ): Promise<Document> {
    const { target, identity } = await this.generator.context(document);
    const storageKey = await this.renderer.render(
      document,
      target,
      content,
      identity,
    );
    return this.prisma.document.update({
      where: { id: document.id },
      data: { storageKey },
    });
  }

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
    input: {
      jobId?: string;
      jobDescription?: string;
      company?: string;
      title?: string;
    },
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

  async source(userId: string, id: string): Promise<string> {
    const document = await this.get(userId, id);
    if (!document.storageKey) {
      throw new NotFoundException('Tài liệu này không có file nguồn');
    }
    return this.renderer.readSource(document.storageKey);
  }

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

    return this.writeSource(updated, content);
  }

  /** HTML cho khung xem trước; `override` cho thử mẫu khác mà không ghi database. */
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

    const { identity } = await this.generator.context(document);

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

  async pdf(userId: string, id: string, engine: PdfEngine = 'latex') {
    if (engine === 'html') {
      const html = await this.previewHtml(userId, id);
      return this.renderer.htmlToPdf(html, id);
    }

    const tex = await this.source(userId, id);
    return this.renderer.toPdf(tex, id);
  }
}
