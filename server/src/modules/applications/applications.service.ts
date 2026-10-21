import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ApplicationStatus } from '@/generated/prisma/enums';
import type { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { pageArgs, pageOf } from '@/common/pagination';
import { isUniqueViolation } from '@/prisma/prisma-errors';
import { PrismaService } from '@/prisma/prisma.service';
import { DocumentsService } from '../documents/services/documents.service';
import { QUEUE, QueueService } from '../queue/queue.service';
import { isFinal, timestampsFor } from './transitions';
import { messageOf } from '@/common/error-message';

const APPLICATION_JOB = {
  id: true,
  title: true,
  company: true,
  companyLogo: true,
  location: true,
  salaryRaw: true,
  url: true,
} as const;

const APPLICATION_DOCUMENT = {
  id: true,
  jobId: true,
  kind: true,
  title: true,
  status: true,
  templateId: true,
  generatedAt: true,
} as const;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly queue: QueueService,
  ) {}

  async create(userId: string, jobId: string, skipDocuments = false) {
    const match = await this.prisma.jobMatch.findUnique({
      where: { userId_jobId: { userId, jobId } },
      select: {
        status: true,
        eligibility: true,
        eligibilityNote: true,
        overallScore: true,
        verdict: true,
        job: { select: { title: true, company: true } },
      },
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

    const initialStatus = 'VIEWED';

    const application = await this.prisma.application
      .create({
        data: {
          userId,
          jobId,
          status: initialStatus,
          events: {
            create: {
              toStatus: initialStatus,
              note: match
                ? `Tạo đơn từ kết quả chấm điểm ${match.overallScore ?? 0}/100 (${match.verdict ?? 'chưa có kết luận'})`
                : 'Đã xem tin tuyển dụng',
            },
          },
        },
        include: { job: { select: APPLICATION_JOB } },
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

    try {
      await Promise.all([
        this.queue.send(QUEUE.GENERATE_DOCUMENT, { userId, documentId: cv.id }),
        this.queue.send(QUEUE.GENERATE_DOCUMENT, {
          userId,
          documentId: coverLetter.id,
        }),
      ]);
    } catch (queueError) {
      await this.documents.markFailed(
        [cv.id, coverLetter.id],
        userId,
        `Không thể đưa vào hàng đợi: ${messageOf(queueError)}`,
      );
      throw queueError;
    }
  }

  async jobOptions(userId: string, status?: ApplicationStatus) {
    const rows = await this.prisma.application.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      select: {
        jobId: true,
        job: { select: { title: true, company: true, companyLogo: true } },
      },
    });
    return rows.map(({ jobId, job }) => ({
      jobId,
      title: job.title,
      company: job.company,
      companyLogo: job.companyLogo,
    }));
  }

  async list(
    userId: string,
    query: PaginationQueryDto,
    status?: ApplicationStatus,
  ) {
    const where = { userId, ...(status ? { status } : {}) };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        ...pageArgs(query),
        include: {
          job: {
            select: {
              ...APPLICATION_JOB,
              documents: {
                where: { userId, kind: 'CV' },
                select: APPLICATION_DOCUMENT,
                orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
              },
            },
          },
        },
      }),
      this.prisma.application.count({ where }),
    ]);

    const rows = items.map(({ job: { documents, ...job }, ...item }) => ({
      ...item,
      job,
      documents,
    }));
    return pageOf(rows, total, query);
  }

  async updateStatus(
    userId: string,
    id: string,
    to: ApplicationStatus,
    note?: string,
  ) {
    const application = await this.prisma.application.findFirst({
      where: { id, userId },
    });
    if (!application)
      throw new NotFoundException('Không tìm thấy đơn ứng tuyển');

    if (application.status === to) {
      throw new BadRequestException(`Đơn đã ở trạng thái ${to}`);
    }

    const stamps = timestampsFor(
      to,
      { appliedAt: application.appliedAt, closedAt: application.closedAt },
      new Date(),
    );

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.application.updateMany({
        where: { id, userId, status: application.status },
        data: { status: to, ...stamps },
      });
      if (count === 0) {
        throw new ConflictException(
          'Trạng thái đơn vừa được đổi ở nơi khác. Hãy tải lại rồi thử lại.',
        );
      }

      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          fromStatus: application.status,
          toStatus: to,
          note,
        },
      });

      return tx.application.findUniqueOrThrow({
        where: { id },
        include: { job: { select: APPLICATION_JOB } },
      });
    });
  }

  async setInterviewDate(userId: string, id: string, interviewAt: Date | null) {
    const { count } = await this.prisma.application.updateMany({
      where: { id, userId },
      data: { interviewAt },
    });
    if (!count) throw new NotFoundException('Không tìm thấy đơn ứng tuyển');

    return this.prisma.application.findUniqueOrThrow({
      where: { id },
      include: { job: { select: APPLICATION_JOB } },
    });
  }

  async countsFor(userId: string): Promise<{ total: number; active: number }> {
    const groups = await this.prisma.application.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });
    let total = 0;
    let active = 0;
    for (const group of groups) {
      total += group._count._all;
      if (!isFinal(group.status)) active += group._count._all;
    }
    return { total, active };
  }
}
