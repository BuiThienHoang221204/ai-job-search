import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ApplicationStatus } from '../../generated/prisma/enums.js';
import type { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../common/pagination.js';
import { isUniqueViolation } from '../../prisma/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DocumentsService } from '../documents/services/documents.service.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import {
  checkTransition,
  groupOf,
  statusesOfGroup,
  timestampsFor,
  type StatusGroup,
  type TransitionActor,
} from './transitions.js';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly queue: QueueService,
  ) {}

  /** Tạo đơn ứng tuyển cho một công việc. */
  async create(userId: string, jobId: string, skipDocuments = false, cvDocumentId?: string) {
    const match = await this.prisma.jobMatch.findUnique({
      where: { userId_jobId: { userId, jobId } },
      include: { job: true },
    });

    if (!skipDocuments) {
      if (!match) {
        throw new BadRequestException(
          'Chưa chấm điểm công việc này. Hãy chạy đánh giá độ phù hợp trước khi tạo đơn.',
        );
      }
      if (match.status !== 'DONE') {
        throw new BadRequestException(
          `Kết quả chấm điểm đang ở trạng thái ${match.status}, chưa dùng được để tạo đơn.`,
        );
      }
      if (match.eligibility === 'FAIL') {
        throw new BadRequestException(
          `Công việc này không đủ điều kiện ứng tuyển: ${match.eligibilityNote ?? 'tin tuyển dụng đòi điều kiện mà hồ sơ không đáp ứng'}`,
        );
      }
    }

    // skipDocuments=true và không có cvDocumentId → tạo đơn ở trạng thái VIEWED
    const initialStatus = skipDocuments && !cvDocumentId ? 'VIEWED' : 'RANKED';

    const application = await this.prisma.application
      .create({
        data: {
          userId,
          jobId,
          status: initialStatus,
          events: {
            create: {
              toStatus: initialStatus,
              note: cvDocumentId
                ? `Đã chọn CV: ${cvDocumentId}`
                : match
                  ? `Tạo đơn từ kết quả chấm điểm ${match.overallScore ?? 0}/100 (${match.verdict ?? 'chưa có kết luận'})`
                  : 'Đã xem tin tuyển dụng',
            },
          },
        },
        include: { job: true },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'Bạn đã có đơn ứng tuyển cho công việc này',
          );
        }
        throw error;
      });

    if (!skipDocuments && match) {
      await this.prepareDocuments(
        userId,
        jobId,
        match.job.title,
        match.job.company,
      );
    }

    return application;
  }

  /** Bước 2 và 3 của SKILL.md: CV theo vị trí và thư xin việc. */
  private async prepareDocuments(
    userId: string,
    jobId: string,
    title: string,
    company: string,
  ): Promise<void> {
    const [cv, coverLetter] = await Promise.all([
      this.documents.create(userId, 'CV', `CV - ${title}`, jobId),
      this.documents.create(
        userId,
        'COVER_LETTER',
        `Thư xin việc - ${company}`,
        jobId,
      ),
    ]);

    await Promise.all([
      this.queue.send(QUEUE.GENERATE_DOCUMENT, { userId, documentId: cv.id }),
      this.queue.send(QUEUE.GENERATE_DOCUMENT, {
        userId,
        documentId: coverLetter.id,
      }),
    ]);
  }

  /**
   * Danh sách đơn kèm số lượng theo từng nhóm, dùng cho các tab trên màn hình
   * Lịch sử ứng tuyển. Chỉ đọc DB, không gọi AI.
   *
   * `counts` đếm bằng `groupBy` chứ không đếm lại mảng đã tải: đếm trong bộ nhớ
   * buộc phải kéo TOÀN BỘ đơn về mới ra được con số, nên danh sách không phân
   * trang được.
   */
  async list(
    userId: string,
    group: StatusGroup | undefined,
    query: PaginationQueryDto,
  ) {
    const where = {
      userId,
      ...(group ? { status: { in: statusesOfGroup(group) } } : {}),
    };

    const [[items, total], grouped] = await Promise.all([
      this.prisma.$transaction([
        this.prisma.application.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          ...pageArgs(query),
          include: {
            job: {
              select: {
                id: true,
                title: true,
                company: true,
                companyLogo: true,
                location: true,
                salaryRaw: true,
                url: true,
              },
            },
          },
        }),
        this.prisma.application.count({ where }),
      ]),
      this.prisma.application.groupBy({
        by: ['status'],
        where: { userId },
        orderBy: { status: 'asc' },
        _count: true,
      }),
    ]);

    const counts = grouped.reduce<Record<string, number>>(
      (acc, row) => {
        acc[groupOf(row.status)] += row._count;
        acc.all += row._count;
        return acc;
      },
      { all: 0, open: 0, interview: 0, offer: 0, closed: 0 },
    );

    const jobIds = [...new Set(items.map((item) => item.jobId))];
    const documents = await this.prisma.document.findMany({
      where: { userId, jobId: { in: jobIds }, kind: 'CV' },
      select: {
        id: true,
        jobId: true,
        kind: true,
        title: true,
        status: true,
        templateId: true,
        generatedAt: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    const docsByJob = new Map<string, typeof documents>();
    for (const doc of documents) {
      if (!doc.jobId) continue;
      const list = docsByJob.get(doc.jobId) ?? [];
      list.push(doc);
      docsByJob.set(doc.jobId, list);
    }

    const itemsWithDocs = items.map((item) => ({
      ...item,
      documents: docsByJob.get(item.jobId) ?? [],
    }));

    return { ...pageOf(itemsWithDocs, total, query), counts };
  }

  async get(userId: string, id: string) {
    const application = await this.prisma.application.findFirst({
      where: { id, userId },
      include: {
        job: true,
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!application)
      throw new NotFoundException('Không tìm thấy đơn ứng tuyển');

    const [documents, interviewPrep] = await Promise.all([
      this.prisma.document.findMany({
        where: { userId, jobId: application.jobId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.interviewPrep.findUnique({
        where: { userId_jobId: { userId, jobId: application.jobId } },
      }),
    ]);

    return { ...application, documents, interviewPrep };
  }

  /** Đổi trạng thái đơn. */
  async updateStatus(
    userId: string,
    id: string,
    to: ApplicationStatus,
    note?: string,
    actor: TransitionActor = 'user',
  ) {
    const application = await this.prisma.application.findFirst({
      where: { id, userId },
      include: { events: { select: { toStatus: true } } },
    });
    if (!application)
      throw new NotFoundException('Không tìm thấy đơn ứng tuyển');

    const hadOffer =
      application.status === 'OFFER' ||
      application.events.some((event) => event.toStatus === 'OFFER');

    const check = checkTransition({
      from: application.status,
      to,
      actor,
      hadOffer,
    });
    if (!check.ok) throw new BadRequestException(check.reason);

    const stamps = timestampsFor(
      to,
      { appliedAt: application.appliedAt, closedAt: application.closedAt },
      new Date(),
    );

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: to,
        ...stamps,
        events: {
          create: { fromStatus: application.status, toStatus: to, note },
        },
      },
      include: { job: true, events: { orderBy: { createdAt: 'asc' } } },
    });

    if (to === 'INTERVIEW') {
      try {
        await this.queue.send(QUEUE.INTERVIEW_PREP, {
          userId,
          jobId: application.jobId,
          force: false,
        });
      } catch (error) {
        this.logger.warn(
          `Không xếp được hàng đợi chuẩn bị phỏng vấn cho đơn ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return updated;
  }

  /** Số liệu cho màn hình Tổng quan. */
  async countsFor(userId: string): Promise<{ total: number; active: number }> {
    const rows = await this.prisma.application.findMany({
      where: { userId },
      select: { status: true },
    });
    return {
      total: rows.length,
      active: rows.filter((row) => groupOf(row.status) !== 'closed').length,
    };
  }
}
