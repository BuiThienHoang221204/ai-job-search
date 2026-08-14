import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ApplicationStatus } from '../../generated/prisma/enums.js';
import { isUniqueViolation } from '../../prisma/prisma-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import {
  checkTransition,
  groupOf,
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

  /// Tạo đơn ứng tuyển cho một công việc.
  ///
  /// Bước 1 của SKILL.md (đánh giá độ phù hợp) phải XONG trước, và ở đây chỉ
  /// kiểm tra kết quả chứ không chấm lại. Đơn không thể tồn tại mà không có
  /// điểm: cả màn hình lẫn thư xin việc đều dựng trên kết quả chấm đó.
  ///
  /// eligibility = FAIL là cổng chặn cứng theo `04-job-evaluation.md`: tin đòi
  /// quốc tịch hoặc giấy phép lao động mà ứng viên không đáp ứng thì không soạn
  /// hồ sơ, vì nộp cũng không được xét.
  async create(userId: string, jobId: string) {
    const match = await this.prisma.jobMatch.findUnique({
      where: { userId_jobId: { userId, jobId } },
      include: { job: true },
    });

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

    // Chống trùng đơn bằng ràng buộc @@unique([userId, jobId]), KHÔNG bằng một
    // lần đọc trước đó: hai request đồng thời đều đọc thấy "chưa có đơn" rồi
    // cùng ghi, và chỉ DB mới phân xử được ai thắng. Đọc trước rồi ghi sau thì
    // kẻ thua nhận 500 thay vì 409.
    const application = await this.prisma.application
      .create({
        data: {
          userId,
          jobId,
          status: 'RANKED',
          events: {
            create: {
              toStatus: 'RANKED',
              note: `Tạo đơn từ kết quả chấm điểm ${match.overallScore ?? 0}/100 (${match.verdict ?? 'chưa có kết luận'})`,
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

    await this.prepareDocuments(
      userId,
      jobId,
      match.job.title,
      match.job.company,
    );

    return application;
  }

  /// Bước 2 và 3 của SKILL.md: CV theo vị trí và thư xin việc.
  ///
  /// Bước 4 (chuẩn bị phỏng vấn) CỐ Ý không chạy ở đây mà đợi đến khi trạng
  /// thái chuyển sang INTERVIEW. Ba lần gọi model cho một đơn vừa mới tạo là
  /// lãng phí: phần lớn đơn không đi tới vòng phỏng vấn, mà mỗi lần gọi mất
  /// hàng chục giây trên gateway free và có gần một nửa khả năng hỏng.
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

  /// Danh sách đơn kèm số lượng theo từng nhóm, dùng cho các tab trên màn hình
  /// Lịch sử ứng tuyển. Chỉ đọc DB, không gọi AI.
  async list(userId: string, group?: StatusGroup) {
    const rows = await this.prisma.application.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
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
    });

    // Đếm trên toàn bộ rồi mới lọc: các tab phải hiện tổng số thật, không phải
    // số sau khi đã lọc theo chính tab đang chọn.
    const counts = rows.reduce<Record<string, number>>(
      (acc, row) => {
        const key = groupOf(row.status);
        acc[key] = (acc[key] ?? 0) + 1;
        acc.all += 1;
        return acc;
      },
      { all: 0, open: 0, interview: 0, offer: 0, closed: 0 },
    );

    const items = group
      ? rows.filter((row) => groupOf(row.status) === group)
      : rows;

    return { items, counts };
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

    // Tài liệu của đơn được SUY RA chứ không lưu khóa ngoại - xem ghi chú trên
    // model Application trong schema.prisma.
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

  /// Đổi trạng thái đơn.
  ///
  /// `actor` mặc định là 'user' vì đường vào duy nhất hiện nay là người dùng
  /// bấm nút. Khi nào có đồng bộ hộp thư thì truyền 'system' để các quy tắc
  /// trong transitions.ts chặn được việc máy tự quyết thay người.
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

    // Bước 4 của SKILL.md, kích hoạt đúng lúc cần: có lịch phỏng vấn rồi mới
    // soạn câu hỏi. Hỏng ở đây không được làm hỏng việc đổi trạng thái - trạng
    // thái là sự thật người dùng vừa nhập, còn chuẩn bị phỏng vấn thì bấm lại
    // được.
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

  /// Số liệu cho màn hình Tổng quan.
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
