import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  formatInterviewDossier,
  type InterviewDossier,
} from './utils/interview-dossier.js';

/** Một mục trong `InterviewPrep.toughQuestions`, phần duy nhất ta đọc tới. */
type ToughQuestion = { question?: unknown };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DOCUMENT_LABEL: Record<string, string> = {
  CV: 'CV',
  COVER_LETTER: 'Thư xin việc',
  APPLICATION_EMAIL: 'Mail ứng tuyển',
  FORM_ANSWER: 'Bảng trả lời câu hỏi',
};

/**
 * Gom bối cảnh có sẵn trong database thành một khối văn bản cho prompt.
 *
 * Vì sao nạp sẵn thay vì cấp thêm tool cho agent tự đi tìm: **đã đo** ở lượt
 * chạy `/interview` đầu tiên - agent tiêu 7 trên 16 bước cho hai vòng hỏi lại
 * mà vẫn chưa tới phần luyện phỏng vấn. Mỗi tool call ở đây tốn 6-28 giây và
 * một bước trong ngân sách; một truy vấn Prisma tốn vài mili giây và không tốn
 * bước nào.
 *
 * Giao diện cố ý chỉ có MỘT hàm: người gọi không cần biết bối cảnh của kịch bản
 * nào gồm bảng nào, và thêm kịch bản mới không đổi chữ ký.
 */
@Injectable()
export class AgentContextService {
  private readonly logger = new Logger(AgentContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Khối bối cảnh cho một lượt chạy, hoặc chuỗi rỗng khi không có gì để thêm.
   *
   * Rỗng là kết quả BÌNH THƯỜNG, không phải lỗi: `/apply` nhận tin tuyển dụng
   * từ URL người dùng dán vào nên chẳng có gì trong database để gom.
   */
  async build(input: {
    userId: string;
    workflow: string;
    jobId?: string | null;
  }): Promise<string> {
    if (input.workflow !== 'interview' || !input.jobId) return '';

    const dossier = await this.interviewDossier(input.userId, input.jobId);
    if (!dossier) {
      this.logger.warn(
        `Không dựng được bối cảnh: không có công việc ${input.jobId}`,
      );
      return '';
    }

    return formatInterviewDossier(dossier);
  }

  /** Đọc năm bảng trong một lượt: công việc, đơn, tài liệu, bộ đề, điểm chấm. */
  private async interviewDossier(
    userId: string,
    jobId: string,
  ): Promise<InterviewDossier | null> {
    const key = { userId_jobId: { userId, jobId } };

    const [job, application, documents, prep, match] = await Promise.all([
      this.prisma.job.findUnique({
        where: { id: jobId },
        select: {
          title: true,
          company: true,
          location: true,
          description: true,
        },
      }),
      this.prisma.application.findUnique({
        where: key,
        select: { status: true, updatedAt: true, appliedAt: true },
      }),
      this.prisma.document.findMany({
        where: { userId, jobId, status: 'DONE' },
        select: { kind: true, title: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.interviewPrep.findUnique({
        where: key,
        select: { toughQuestions: true, likelyProbes: true, status: true },
      }),
      this.prisma.jobMatch.findUnique({
        where: key,
        select: { overallScore: true, gaps: true, status: true },
      }),
    ]);

    if (!job) return null;

    return {
      job,
      application: application && {
        status: application.status,
        quietDays: application.appliedAt
          ? Math.floor(
              (Date.now() - application.updatedAt.getTime()) / MS_PER_DAY,
            )
          : null,
      },
      documents: documents.map((doc) => ({
        label: DOCUMENT_LABEL[doc.kind] ?? doc.kind,
        title: doc.title,
      })),
      prep:
        prep?.status === 'DONE'
          ? {
              toughQuestions: this.questionTexts(prep.toughQuestions),
              likelyProbes: prep.likelyProbes,
            }
          : null,
      match:
        match?.status === 'DONE' && match.overallScore !== null
          ? { score: match.overallScore, gaps: match.gaps }
          : null,
    };
  }

  /**
   * Rút câu hỏi ra khỏi cột Json, bỏ qua mục nào không đúng dạng.
   *
   * Cột này do model sinh ra và schema có thể đổi giữa các phiên bản, nên đọc
   * phòng thủ: một bản ghi cũ sai dạng chỉ nên mất đúng dòng đó, không nên làm
   * hỏng cả lượt chạy.
   */
  private questionTexts(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item) => (item as ToughQuestion)?.question)
      .filter((question): question is string => typeof question === 'string');
  }
}
