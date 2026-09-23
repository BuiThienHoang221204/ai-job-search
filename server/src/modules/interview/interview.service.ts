import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  InterviewPrep,
  Job,
  JobMatch,
  Profile,
} from '../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { AiService } from '../ai/services/ai.service.js';
import type { ModelStreamEvent } from '../../common/stream-event.js';
import { withFailureKind, withFailureKinds } from '../ai/utils/failure-view.js';
import { PromptBuilderService } from '../skills/services/prompt-builder.service.js';
import { SkillRegistryService } from '../skills/services/skill-registry.service.js';
import {
  interviewPrepSchema,
  type InterviewPrepResult,
} from './interview.schema.js';
import {
  BEHAVIOURAL_SECTIONS,
  buildPrepPrompt,
  PREP_SECTIONS,
} from './utils/interview-prep.prompt.js';

const SKILL_NAME = 'job-application-assistant';

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

  /** Xếp hàng đợi VÀ ghi bản ghi PENDING ngay, nếu không giao diện tải lại vẫn thấy danh sách cũ; bản DONE thì để yên. */
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
    const willRun = force || existing?.status !== 'DONE';

    if (willRun) {
      await this.prisma.interviewPrep.upsert({
        where: { userId_jobId: { userId, jobId } },
        create: { userId, jobId, status: 'PENDING' },
        update: { status: 'PENDING', error: null },
      });
    }

    try {
      const queueJobId = await this.queue.send(QUEUE.INTERVIEW_PREP, {
        userId,
        jobId,
        force,
      });
      return { queued: true, queueJobId };
    } catch (error) {
      if (willRun) {
        await this.prisma.interviewPrep.update({
          where: { userId_jobId: { userId, jobId } },
          data: { status: 'FAILED', error: 'Không xếp được vào hàng đợi' },
        });
      }
      throw error;
    }
  }

  private buildPrompt(
    profile: Profile | null,
    job: Job,
    match: JobMatch | null,
  ) {
    const skill = this.skills.get(SKILL_NAME);

    const section = (file: string, keep: string[]) =>
      this.prompts.render(
        this.prompts.keepSections(skill.references.get(file) ?? '', keep),
        profile,
      );

    const { system, prompt } = buildPrepPrompt({
      framework: section('07-interview-prep.md', PREP_SECTIONS),
      behavioural: section('02-behavioral-profile.md', BEHAVIOURAL_SECTIONS),
      profileSummary: this.prompts.profileSummary(profile),
      job,
      gaps: match?.gaps ?? [],
    });

    return { system, prompt, skillHash: skill.contentHash };
  }

  /** Phần chung của đường đồng bộ và đường stream: đọc dữ liệu, dựng prompt, tính hash, giành chỗ RUNNING. */
  private async prepare(
    userId: string,
    jobId: string,
    force: boolean,
  ): Promise<
    | { cached: InterviewPrep }
    | { cached?: never; system: string; prompt: string; hash: string }
  > {
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
    const hash = createHash('sha256')
      .update(skillHash)
      .update(profile ? JSON.stringify(profile) : 'no-profile')
      .update(job.description)
      .update(match?.gaps.join('|') ?? '')
      .digest('hex')
      .slice(0, 32);

    if (!force && existing?.status === 'DONE' && existing.promptHash === hash) {
      return { cached: existing };
    }

    await this.prisma.interviewPrep.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId, status: 'RUNNING' },
      update: { status: 'RUNNING', error: null },
    });

    return { system, prompt, hash };
  }

  /** Ghi lỗi vào bản ghi rồi trả lại câu lỗi cho người gọi tự quyết cách báo. */
  private async fail(
    userId: string,
    jobId: string,
    error: unknown,
    label: string,
  ): Promise<{ prep: InterviewPrep; message: string }> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`${label} thất bại (job=${jobId}): ${message}`);
    const prep = await this.prisma.interviewPrep.update({
      where: { userId_jobId: { userId, jobId } },
      data: { status: 'FAILED', error: message },
    });
    return { prep, message };
  }

  async generate(
    userId: string,
    jobId: string,
    force = false,
  ): Promise<InterviewPrep> {
    const ready = await this.prepare(userId, jobId, force);
    if (ready.cached) return ready.cached;
    const { system, prompt, hash } = ready;

    try {
      const { object, modelId } =
        await this.ai.generateObject<InterviewPrepResult>({
          schema: interviewPrepSchema,
          context: { purpose: 'interview.prep', userId: userId },
          system,
          prompt,
        });

      return await this.persist(userId, jobId, object, modelId, hash);
    } catch (error) {
      const { prep } = await this.fail(userId, jobId, error, 'Soạn câu hỏi');
      return prep;
    }
  }

  private persist(
    userId: string,
    jobId: string,
    object: InterviewPrepResult,
    modelId: string,
    hash: string,
  ) {
    return this.prisma.interviewPrep.update({
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
  }

  async *streamGenerate(
    userId: string,
    jobId: string,
    force = false,
  ): AsyncGenerator<ModelStreamEvent<InterviewPrep>> {
    const ready = await this.prepare(userId, jobId, force);
    if (ready.cached) {
      yield { type: 'done', result: ready.cached };
      return;
    }
    const { system, prompt, hash } = ready;

    try {
      const { partials, object, modelId } =
        await this.ai.streamObject<InterviewPrepResult>({
          schema: interviewPrepSchema,
          context: { purpose: 'interview.prep', userId },
          system,
          prompt,
        });

      for await (const partial of partials) {
        yield { type: 'partial', data: partial };
      }

      const final = await object;
      yield {
        type: 'done',
        result: await this.persist(userId, jobId, final, modelId, hash),
      };
    } catch (error) {
      const { message } = await this.fail(
        userId,
        jobId,
        error,
        'Soạn câu hỏi (stream)',
      );
      yield { type: 'error', message };
    }
  }

  async get(userId: string, jobId: string) {
    const prep = await this.prisma.interviewPrep.findUnique({
      where: { userId_jobId: { userId, jobId } },
      include: { job: true },
    });
    if (!prep)
      throw new NotFoundException('Chưa soạn câu hỏi cho công việc này');
    return withFailureKind(prep);
  }

  async list(userId: string, query: PaginationQueryDto) {
    const where = { userId };

    const [preps, total] = await this.prisma.$transaction([
      this.prisma.interviewPrep.findMany({
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
            },
          },
        },
      }),
      this.prisma.interviewPrep.count({ where }),
    ]);

    return pageOf(withFailureKinds(preps), total, query);
  }
}
