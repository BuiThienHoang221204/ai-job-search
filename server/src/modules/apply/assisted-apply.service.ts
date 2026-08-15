import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ApplyAttempt } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import {
  STORAGE,
  userKey,
  type Storage,
} from '../storage/storage.interface.js';
import { DocumentsService } from '../documents/documents.service.js';
import { BrowserApplyService } from './browser-apply.service.js';
import type { ApplyResult } from './apply.types.js';

/**
 * Ảnh chụp là PNG toàn trang, đo được ~555KB trên một form thật. Giữ trong Storage
 * chứ không nhồi vào database: nó là file, và cột `Bytes` sẽ làm mọi truy vấn lịch
 * sử kéo theo hàng megabyte không ai cần.
 */
const screenshotKey = (userId: string, attemptId: string): string =>
  userKey(userId, 'apply', `${attemptId}.png`);

@Injectable()
export class AssistedApplyService {
  private readonly logger = new Logger(AssistedApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly browser: BrowserApplyService,
    private readonly documents: DocumentsService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** Tạo bản ghi PENDING rồi xếp việc. Trả về biên nhận, KHÔNG trả về kết quả. */
  async start(userId: string, jobId: string): Promise<{ attemptId: string }> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, url: true },
    });
    if (!job) throw new NotFoundException('Không tìm thấy tin tuyển dụng.');

    if (!job.url) {
      throw new BadRequestException(
        'Tin tuyển dụng này không có link ứng tuyển để mở.',
      );
    }

    const attempt = await this.prisma.applyAttempt.create({
      data: { userId, jobId, status: 'PENDING' },
      select: { id: true },
    });

    await this.queue.send(QUEUE.APPLY_ASSIST, { attemptId: attempt.id });
    return { attemptId: attempt.id };
  }

  /** Chạy một lượt. Gọi từ worker, KHÔNG gọi từ đường HTTP. */
  async execute(attemptId: string): Promise<void> {
    const attempt = await this.prisma.applyAttempt.findUnique({
      where: { id: attemptId },
      include: {
        job: { select: { url: true, title: true } },
        user: {
          select: {
            name: true,
            email: true,
            profile: { select: { phone: true, location: true } },
          },
        },
      },
    });
    if (!attempt) {
      this.logger.warn(`Bỏ qua: không còn bản ghi ${attemptId}`);
      return;
    }

    await this.prisma.applyAttempt.update({
      where: { id: attemptId },
      data: { status: 'RUNNING' },
    });

    try {
      const documents = await this.attachments(attempt.userId, attempt.jobId);

      const result = await this.browser.run({
        url: attempt.job.url,
        identity: {
          name: attempt.user.name,
          email: attempt.user.email,
          phone: attempt.user.profile?.phone ?? null,
          location: attempt.user.profile?.location ?? null,
        },
        ...documents,
      });

      await this.store(attempt.id, attempt.userId, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lượt ${attemptId} hỏng: ${message}`);
      await this.prisma.applyAttempt.update({
        where: { id: attemptId },
        data: { status: 'FAILED', error: message.slice(0, 800) },
      });
    }
  }

  /** Lấy CV và thư xin việc mới nhất đã DONE, dạng PDF. */
  private async attachments(
    userId: string,
    jobId: string,
  ): Promise<{ cv?: Buffer; coverLetter?: Buffer }> {
    const [cv, coverLetter] = await Promise.all([
      this.latestPdf(userId, 'CV', jobId),
      this.latestPdf(userId, 'COVER_LETTER', jobId),
    ]);
    return { cv, coverLetter };
  }

  private async latestPdf(
    userId: string,
    kind: 'CV' | 'COVER_LETTER',
    jobId: string,
  ): Promise<Buffer | undefined> {
    const document =
      (await this.prisma.document.findFirst({
        where: { userId, kind, jobId, status: 'DONE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })) ??
      (await this.prisma.document.findFirst({
        where: { userId, kind, status: 'DONE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }));

    if (!document) return undefined;

    try {
      return await this.documents.pdf(userId, document.id);
    } catch (error) {
      this.logger.warn(
        `Không compile được ${kind} ${document.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private async store(
    attemptId: string,
    userId: string,
    result: ApplyResult,
  ): Promise<void> {
    let key: string | null = null;
    if (result.screenshot) {
      key = screenshotKey(userId, attemptId);
      try {
        await this.storage.write(key, result.screenshot);
      } catch (error) {
        this.logger.warn(
          `Không lưu được ảnh chụp: ${error instanceof Error ? error.message : String(error)}`,
        );
        key = null;
      }
    }

    await this.prisma.applyAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'DONE',
        outcome: result.outcome,
        message: result.message,
        filled: result.filled as unknown as Prisma.InputJsonValue,
        unmatched: result.unmatched,
        screenshotKey: key,
      },
    });
  }

  /** Lượt gần nhất của một tin. Đường ĐỌC, không gọi gì nặng. */
  async latest(userId: string, jobId: string): Promise<ApplyAttempt | null> {
    return this.prisma.applyAttempt.findFirst({
      where: { userId, jobId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: string, attemptId: string): Promise<ApplyAttempt> {
    const attempt = await this.prisma.applyAttempt.findFirst({
      where: { id: attemptId, userId },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy lượt ứng tuyển.');
    return attempt;
  }

  async screenshot(userId: string, attemptId: string): Promise<Buffer> {
    const attempt = await this.get(userId, attemptId);
    if (!attempt.screenshotKey) {
      throw new NotFoundException('Lượt này không có ảnh chụp.');
    }
    return this.storage.read(attempt.screenshotKey);
  }

  /** Người dùng khẳng định đã TỰ nộp trên trang tuyển dụng. */
  async confirm(userId: string, attemptId: string): Promise<ApplyAttempt> {
    const attempt = await this.get(userId, attemptId);

    if (attempt.confirmedAt) return attempt;

    return this.prisma.applyAttempt.update({
      where: { id: attempt.id },
      data: { confirmedAt: new Date() },
    });
  }
}
