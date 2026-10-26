import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  InterviewPrep,
  Job,
  JobMatch,
  MatchStatus,
  Profile,
} from '@/generated/prisma/client';
import type { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { fingerprint } from '@/common/fingerprint';
import { pageArgs, pageOf } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import { QUEUE, QueueService } from '../queue/queue.service';
import { AiService } from '../ai/services/ai.service';
import { withFailureKind } from '@/common/ai/failure-view';
import { PromptBuilderService } from '../skills/services/prompt-builder.service';
import { SkillRegistryService } from '../skills/services/skill-registry.service';
import { interviewPrepSchema } from './interview.schema';
import {
  BEHAVIOURAL_SECTIONS,
  buildPrepPrompt,
  PREP_SECTIONS,
} from './utils/interview-prep.prompt';
import { practiceProgress, readinessOf } from './utils/interview-answers';
import { messageOf } from '@/common/error-message';
import { isUniqueViolation } from '@/prisma/prisma-errors';

const SKILL_NAME = 'job-application-assistant';

const ANSWER_FIELDS = {
  questionKey: true,
  text: true,
  feedback: true,
  feedbackKey: true,
  updatedAt: true,
} as const;

const APPLICATION_FIELDS = {
  id: true,
  jobId: true,
  status: true,
  interviewAt: true,
} as const;

function renderSection(
  prompts: PromptBuilderService,
  references: Map<string, string>,
  file: string,
  keep: string[],
  profile: Profile | null,
): string {
  return prompts.render(
    prompts.keepSections(references.get(file) ?? '', keep),
    profile,
  );
}

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly skills: SkillRegistryService,
    private readonly prompts: PromptBuilderService,
    private readonly queue: QueueService,
  ) {}

  async enqueue(
    userId: string,
    jobId: string,
    force: boolean,
  ): Promise<{ queued: true; queueJobId: string | null }> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

    const existing = await this.prisma.interviewPrep.findUnique({
      where: { userId_jobId: { userId, jobId } },
      select: { status: true },
    });
    const inFlight =
      existing?.status === 'RUNNING' || existing?.status === 'PENDING';
    if (!force && existing?.status === 'DONE') {
      return { queued: true, queueJobId: null };
    }
    const willRun =
      !inFlight && (await this.claimPending(userId, jobId, force));

    try {
      const queueJobId = await this.queue.send(QUEUE.INTERVIEW_PREP, {
        userId,
        jobId,
        force,
      });
      return { queued: true, queueJobId };
    } catch (error) {
      if (willRun) {
        await this.prisma.interviewPrep.updateMany({
          where: { userId, jobId, status: 'PENDING' },
          data: { status: 'FAILED', error: 'Không xếp được vào hàng đợi' },
        });
      }
      throw error;
    }
  }

  private async claimPending(
    userId: string,
    jobId: string,
    force: boolean,
  ): Promise<boolean> {
    const reopenable: MatchStatus[] = force ? ['DONE', 'FAILED'] : ['FAILED'];
    const { count } = await this.prisma.interviewPrep.updateMany({
      where: { userId, jobId, status: { in: reopenable } },
      data: { status: 'PENDING', error: null },
    });
    if (count) return true;
    try {
      await this.prisma.interviewPrep.create({
        data: { userId, jobId, status: 'PENDING' },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  private buildPrompt(
    profile: Profile | null,
    job: Job,
    match: JobMatch | null,
  ) {
    const skill = this.skills.get(SKILL_NAME);

    const { system, prompt } = buildPrepPrompt({
      framework: renderSection(
        this.prompts,
        skill.references,
        '07-interview-prep.md',
        PREP_SECTIONS,
        profile,
      ),
      behavioural: renderSection(
        this.prompts,
        skill.references,
        '02-behavioral-profile.md',
        BEHAVIOURAL_SECTIONS,
        profile,
      ),
      profileSummary: this.prompts.profileSummary(profile),
      job,
      gaps: match?.gaps ?? [],
    });

    return { system, prompt, skillHash: skill.contentHash };
  }

  /** Giành chỗ RUNNING có điều kiện; `false` khi một lượt khác đang chạy. */
  private async claim(
    userId: string,
    jobId: string,
    exists: boolean,
  ): Promise<boolean> {
    if (!exists) {
      try {
        await this.prisma.interviewPrep.create({
          data: { userId, jobId, status: 'RUNNING' },
        });
        return true;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }

    const { count } = await this.prisma.interviewPrep.updateMany({
      where: { userId, jobId, status: { not: 'RUNNING' } },
      data: { status: 'RUNNING', error: null },
    });
    return count > 0;
  }

  async generate(
    userId: string,
    jobId: string,
    force: boolean,
  ): Promise<InterviewPrep> {
    const [profile, job, match, existing] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.job.findUnique({ where: { id: jobId } }),
      this.prisma.jobMatch.findUnique({
        where: { userId_jobId: { userId, jobId } },
      }),
      this.prisma.interviewPrep.findUnique({
        where: { userId_jobId: { userId, jobId } },
      }),
    ]);

    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

    const { system, prompt, skillHash } = this.buildPrompt(profile, job, match);
    const hash = fingerprint([
      skillHash,
      profile ? JSON.stringify(profile) : 'no-profile',
      job.description,
      match?.gaps.join('|') ?? '',
    ]);

    if (!force && existing?.status === 'DONE' && existing.promptHash === hash) {
      return existing;
    }

    if (!(await this.claim(userId, jobId, existing !== null))) {
      this.logger.warn(
        `Bỏ qua soạn câu hỏi job=${jobId}: đang có lượt khác chạy`,
      );
      return this.prisma.interviewPrep.findUniqueOrThrow({
        where: { userId_jobId: { userId, jobId } },
      });
    }

    try {
      const { object, modelId } = await this.ai.generateObject({
        schema: interviewPrepSchema,
        context: { purpose: 'interview.prep', userId },
        system,
        prompt,
      });
      return await this.prisma.interviewPrep.update({
        where: { userId_jobId: { userId, jobId } },
        data: {
          status: 'DONE',
          starAnswers: object.starAnswers,
          toughQuestions: object.toughQuestions,
          questionsToAsk: object.questionsToAsk,
          talkingPoints: object.talkingPoints,
          likelyProbes: object.likelyProbes,
          modelId,
          promptHash: hash,
          generatedAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      const message = messageOf(error);
      this.logger.error(`Soạn câu hỏi thất bại (job=${jobId}): ${message}`);
      return this.prisma.interviewPrep.update({
        where: { userId_jobId: { userId, jobId } },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  async get(userId: string, jobId: string) {
    const prep = await this.prisma.interviewPrep.findUnique({
      where: { userId_jobId: { userId, jobId } },
      include: {
        job: {
          select: { id: true, title: true, company: true, companyLogo: true },
        },
      },
    });
    if (!prep)
      throw new NotFoundException('Chưa soạn câu hỏi cho công việc này');

    const [answers, application] = await Promise.all([
      this.prisma.interviewAnswer.findMany({
        where: { userId, jobId },
        select: ANSWER_FIELDS,
      }),
      this.prisma.application.findUnique({
        where: { userId_jobId: { userId, jobId } },
        select: APPLICATION_FIELDS,
      }),
    ]);

    return {
      ...withFailureKind(prep),
      ...readinessOf(prep, answers),
      application,
    };
  }

  async list(userId: string, query: PaginationQueryDto) {
    const where = { userId };

    const [preps, total] = await this.prisma.$transaction([
      this.prisma.interviewPrep.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        ...pageArgs(query),
        select: {
          id: true,
          jobId: true,
          status: true,
          error: true,
          generatedAt: true,
          updatedAt: true,
          starAnswers: true,
          toughQuestions: true,
          job: {
            select: {
              id: true,
              title: true,
              company: true,
              companyLogo: true,
            },
          },
        },
      }),
      this.prisma.interviewPrep.count({ where }),
    ]);

    const jobIds = preps.map((prep) => prep.jobId);
    const [answers, applications, mocks] = await Promise.all([
      this.prisma.interviewAnswer.findMany({
        where: { userId, jobId: { in: jobIds } },
        select: { jobId: true, questionKey: true },
      }),
      this.prisma.application.findMany({
        where: { userId, jobId: { in: jobIds } },
        select: APPLICATION_FIELDS,
      }),
      this.prisma.agentRun.groupBy({
        by: ['jobId'],
        where: { userId, workflow: 'interview', jobId: { in: jobIds } },
        _count: { _all: true },
      }),
    ]);
    const mockCountByJob = new Map(
      mocks.map((row) => [row.jobId, row._count._all]),
    );
    const applicationByJob = new Map(
      applications.map((application) => [application.jobId, application]),
    );

    const items = preps.map(({ starAnswers, toughQuestions, ...prep }) => {
      const readiness = practiceProgress(
        { starAnswers, toughQuestions },
        answers
          .filter((answer) => answer.jobId === prep.jobId)
          .map((answer) => answer.questionKey),
      );
      return {
        ...prep,
        practiced: readiness.practiced,
        total: readiness.total,
        application: applicationByJob.get(prep.jobId) ?? null,
        mockCount: mockCountByJob.get(prep.jobId) ?? 0,
      };
    });

    return pageOf(items.map(withFailureKind), total, query);
  }
}
