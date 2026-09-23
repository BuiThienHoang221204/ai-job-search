import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { pageArgs, pageOf } from '../../../common/pagination.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { STUCK_AFTER_MS } from '../../../common/duration.js';
import {
  DOCUMENT_LABEL,
  formatInterviewDossier,
  quietDays,
  toughQuestionTexts,
  trimToolOutput,
  type InterviewDossier,
  type ListMockInterviewsQuery,
} from '../utils/mock-interview.js';

@Injectable()
export class MockInterviewService {
  private readonly logger = new Logger(MockInterviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assertNoRunInFlight(userId: string): Promise<void> {
    const running = await this.prisma.agentRun.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'RUNNING'] },
        updatedAt: { gte: new Date(Date.now() - STUCK_AFTER_MS) },
      },
      select: { id: true },
    });

    if (running) {
      throw new ConflictException(
        'Bạn đang có một buổi luyện chưa xong. Đợi nó kết thúc rồi hãy mở buổi mới.',
      );
    }
  }

  async get(userId: string, runId: string) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, userId },
      include: { steps: { orderBy: { index: 'asc' } } },
    });
    if (!run) {
      throw new NotFoundException(`Không tìm thấy buổi luyện: ${runId}`);
    }
    return run;
  }

  async detail(userId: string, runId: string) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, userId },
      omit: { messages: true },
      include: { steps: { orderBy: { index: 'asc' } } },
    });
    if (!run) {
      throw new NotFoundException(`Không tìm thấy buổi luyện: ${runId}`);
    }
    return {
      ...run,
      steps: run.steps.map((step) => ({
        ...step,
        toolResults: trimToolOutput(step.toolResults) as Prisma.JsonValue,
      })),
    };
  }

  async list(userId: string, query: ListMockInterviewsQuery) {
    const where = {
      userId,
      ...(query.jobId ? { jobId: query.jobId } : {}),
      ...(query.workflow ? { workflow: query.workflow } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.agentRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        select: {
          id: true,
          workflow: true,
          status: true,
          question: true,
          modelId: true,
          error: true,
          createdAt: true,
          finishedAt: true,
          jobId: true,
          job: { select: { title: true, company: true } },
          _count: { select: { steps: true } },
        },
      }),
      this.prisma.agentRun.count({ where }),
    ]);

    return pageOf(items, total, query);
  }

  async buildContext(userId: string, jobId: string): Promise<string> {
    const dossier = await this.interviewDossier(userId, jobId);
    if (!dossier) {
      this.logger.warn(`Không dựng được bối cảnh: không có công việc ${jobId}`);
      return '';
    }

    return formatInterviewDossier(dossier);
  }

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
        quietDays: quietDays(application.appliedAt, application.updatedAt),
      },
      documents: documents.map((doc) => ({
        label: DOCUMENT_LABEL[doc.kind] ?? doc.kind,
        title: doc.title,
      })),
      prep:
        prep?.status === 'DONE'
          ? {
              toughQuestions: toughQuestionTexts(prep.toughQuestions),
              likelyProbes: prep.likelyProbes,
            }
          : null,
      match:
        match?.status === 'DONE' && match.overallScore !== null
          ? { score: match.overallScore, gaps: match.gaps }
          : null,
    };
  }
}
