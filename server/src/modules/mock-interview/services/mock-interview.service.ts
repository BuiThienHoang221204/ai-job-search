import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { pageArgs, pageOf } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import { STUCK_AFTER_MS } from '@/common/duration';
import type { ListMockInterviewsDto } from '../mock-interview.dto';
import {
  DOCUMENT_LABEL,
  formatInterviewDossier,
  projectNames,
  quietDays,
  recentExperiences,
  toughQuestionTexts,
  closingOf,
  type InterviewDossier,
} from '../utils/mock-interview';

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
    return run;
  }

  async list(userId: string, query: ListMockInterviewsDto) {
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
          result: true,
        },
      }),
      this.prisma.agentRun.count({ where }),
    ]);

    const runs = items.map(({ result, ...run }) => ({
      ...run,
      closing: closingOf(run.status, result),
    }));
    return pageOf(runs, total, query);
  }

  async buildContext(userId: string, jobId: string): Promise<string | null> {
    const dossier = await this.interviewDossier(userId, jobId);
    return dossier ? formatInterviewDossier(dossier) : null;
  }

  private async interviewDossier(
    userId: string,
    jobId: string,
  ): Promise<InterviewDossier | null> {
    const key = { userId_jobId: { userId, jobId } };

    const [job, application, documents, prep, match, requirement, profile] =
      await Promise.all([
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
        this.prisma.jobRequirement.findUnique({
          where: { jobId },
          select: { seniority: true, minYears: true, status: true },
        }),
        this.prisma.profile.findUnique({
          where: { userId },
          select: {
            headline: true,
            primarySkills: true,
            experiences: true,
            projects: true,
          },
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
      requirement:
        requirement?.status === 'DONE'
          ? { seniority: requirement.seniority, minYears: requirement.minYears }
          : null,
      candidate: profile && {
        headline: profile.headline,
        skills: profile.primarySkills,
        experiences: recentExperiences(profile.experiences),
        projects: projectNames(profile.projects),
      },
    };
  }
}
