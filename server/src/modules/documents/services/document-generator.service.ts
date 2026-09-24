import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Document, Prisma } from '../../../generated/prisma/client.js';
import type { ModelStreamEvent } from '../../../common/stream-event.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { Identity } from '../content.types.js';
import { letterTarget, type DocumentParams } from '../utils/letter-target.js';
import { DocumentComposer } from './document-composer.service.js';
import { DocumentRenderer } from './document-renderer.service.js';
import { streamFailureEvent } from '../../ai/utils/failure-view.js';

/** Máy trạng thái PENDING → RUNNING → DONE/FAILED, và là nhánh DUY NHẤT của module gọi model. */
@Injectable()
export class DocumentGenerator {
  private readonly logger = new Logger(DocumentGenerator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly composer: DocumentComposer,
    private readonly renderer: DocumentRenderer,
  ) {}

  /** Mọi thứ một lượt soạn thảo cần tra, trong đúng một lượt đi database. */
  async context(document: Document) {
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
      phone: profile?.phone ?? null,
    };

    const params = (document.content ?? {}) as DocumentParams;
    return { profile, target: letterTarget(job, params), params, identity };
  }

  /** Tìm tài liệu, khoá theo `userId`, rồi giành chỗ RUNNING. */
  private async claim(userId: string, documentId: string): Promise<Document> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
    });
    if (!document)
      throw new NotFoundException(`Không tìm thấy tài liệu: ${documentId}`);

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'RUNNING', error: null },
    });

    return document;
  }

  /** Ghi kết quả và đóng trạng thái DONE. */
  private finish(
    documentId: string,
    content: unknown,
    modelId: string,
    storageKey: string | null,
  ): Promise<Document> {
    return this.prisma.document.update({
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
  }

  /** Ghi lỗi vào bản ghi rồi trả lại câu lỗi cho người gọi tự quyết cách báo. */
  private async fail(
    documentId: string,
    error: unknown,
    label: string,
  ): Promise<{ document: Document; message: string }> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`${label} thất bại (${documentId}): ${message}`);
    const document = await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'FAILED', error: message },
    });
    return { document, message };
  }

  /** Chỉ CV và thư xin việc chảy dần được; loại khác rơi về đường đồng bộ. */
  async *streamGenerate(
    userId: string,
    documentId: string,
  ): AsyncGenerator<ModelStreamEvent<Document>> {
    const peek = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { kind: true },
    });
    if (!peek)
      throw new NotFoundException(`Không tìm thấy tài liệu: ${documentId}`);

    if (peek.kind !== 'CV' && peek.kind !== 'COVER_LETTER') {
      yield { type: 'done', result: await this.generate(userId, documentId) };
      return;
    }

    const document = await this.claim(userId, documentId);

    try {
      const { profile, target, identity } = await this.context(document);
      const { partials, object, modelId } =
        document.kind === 'CV'
          ? await this.composer.streamCv(document, profile, target)
          : await this.composer.streamCoverLetter(document, profile, target);

      for await (const partial of partials) {
        yield { type: 'partial', data: partial };
      }

      const content = await object;
      const storageKey = await this.renderer.render(
        document,
        target,
        content,
        identity,
      );

      yield {
        type: 'done',
        result: await this.finish(documentId, content, modelId, storageKey),
      };
    } catch (error) {
      await this.fail(documentId, error, 'Sinh tài liệu (stream)');
      yield streamFailureEvent(error);
    }
  }

  async generate(userId: string, documentId: string): Promise<Document> {
    const document = await this.claim(userId, documentId);

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

      return await this.finish(documentId, content, modelId, storageKey);
    } catch (error) {
      const { document: failed } = await this.fail(
        documentId,
        error,
        'Sinh tài liệu',
      );
      return failed;
    }
  }
}
