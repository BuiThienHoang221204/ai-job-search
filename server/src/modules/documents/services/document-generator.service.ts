import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Document, Prisma } from '@/generated/prisma/client';
import type { ModelStreamEvent } from '@/common/stream-event';
import { PrismaService } from '@/prisma/prisma.service';
import type { Identity } from '../content.types';
import { mergeIdentity } from '../utils/identity';
import { letterTarget, type DocumentParams } from '../utils/letter-target';
import { DocumentComposer } from './document-composer.service';
import { DocumentRenderer } from './document-renderer.service';
import { streamFailureEvent } from '@/common/ai/failure-view';
import { messageOf } from '@/common/error-message';
import { STUCK_AFTER_MS } from '@/common/duration';

@Injectable()
export class DocumentGenerator {
  private readonly logger = new Logger(DocumentGenerator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly composer: DocumentComposer,
    private readonly renderer: DocumentRenderer,
  ) {}

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

    const fromProfile: Identity = {
      name: user.name,
      email: user.email,
      location: profile?.location ?? null,
      title: profile?.headline ?? null,
      phone: profile?.phone ?? null,
    };
    const identity = mergeIdentity(fromProfile, document.identity);

    const params = (document.content ?? {}) as DocumentParams;
    return { profile, target: letterTarget(job, params), identity };
  }

  /** Giành chỗ RUNNING theo `userId`, chỉ khi tài liệu đang chờ, đã hỏng, hoặc RUNNING đã kẹt — bản DONE (có thể đã sửa tay) không bao giờ bị ghi đè. */
  private async claim(
    userId: string,
    documentId: string,
  ): Promise<{ document: Document; claimed: boolean }> {
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS);
    const claim = await this.prisma.document.updateMany({
      where: {
        id: documentId,
        userId,
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          { status: 'RUNNING', updatedAt: { lt: stuckBefore } },
        ],
      },
      data: { status: 'RUNNING', error: null },
    });

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
    });
    if (!document)
      throw new NotFoundException(`Không tìm thấy tài liệu: ${documentId}`);

    return { document, claimed: claim.count > 0 };
  }

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

  private fail(
    documentId: string,
    error: unknown,
    label: string,
  ): Promise<Document> {
    const message = messageOf(error);
    this.logger.error(`${label} thất bại (${documentId}): ${message}`);
    return this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'FAILED', error: message },
    });
  }

  async *streamGenerate(
    userId: string,
    documentId: string,
  ): AsyncGenerator<ModelStreamEvent<Document>> {
    const { document, claimed } = await this.claim(userId, documentId);
    if (!claimed) {
      throw new ConflictException(
        `Tài liệu đang ở trạng thái ${document.status}, không sinh lại được. Muốn bản khác thì tạo tài liệu mới.`,
      );
    }

    if (document.kind !== 'CV' && document.kind !== 'COVER_LETTER') {
      yield { type: 'done', result: await this.compose(document) };
      return;
    }

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
    const { document, claimed } = await this.claim(userId, documentId);
    if (!claimed) {
      this.logger.debug(
        `Bỏ qua tài liệu ${documentId}: đang ${document.status}`,
      );
      return document;
    }
    return this.compose(document);
  }

  private async compose(document: Document): Promise<Document> {
    const documentId = document.id;

    try {
      const { profile, target, identity } = await this.context(document);

      const { object: content, modelId } = await this.composer.compose({
        document,
        profile,
        target,
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
      return this.fail(documentId, error, 'Sinh tài liệu');
    }
  }
}
