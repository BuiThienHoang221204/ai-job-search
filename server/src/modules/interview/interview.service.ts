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
import { AiService } from '../ai/services/ai.service.js';
import type { ModelStreamEvent } from '../../common/stream-event.js';
import { withFailureKind, withFailureKinds } from '../ai/failure-view.js';
import { PromptBuilderService } from '../skills/services/prompt-builder.service.js';
import { SkillRegistryService } from '../skills/services/skill-registry.service.js';
import {
  interviewPrepSchema,
  type InterviewPrepResult,
} from './interview.schema.js';

const SKILL_NAME = 'job-application-assistant';

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly skills: SkillRegistryService,
    private readonly prompts: PromptBuilderService,
  ) {}

  private buildPrompt(
    profile: Profile | null,
    job: Job,
    match: JobMatch | null,
  ) {
    const skill = this.skills.get(SKILL_NAME);

    const framework = this.prompts.render(
      this.prompts.keepSections(
        skill.references.get('07-interview-prep.md') ?? '',
        ['star format', 'common tough questions', 'questions you should ask'],
      ),
      profile,
    );
    const behavioural = this.prompts.render(
      this.prompts.keepSections(
        skill.references.get('02-behavioral-profile.md') ?? '',
        ['behavioral', 'strengths', 'communication', 'working style'],
      ),
      profile,
    );

    const system = [
      'Bạn là huấn luyện viên phỏng vấn. Soạn bộ chuẩn bị phỏng vấn cho một ứng viên trước một vị trí cụ thể.',
      '',
      'Quy tắc bắt buộc:',
      '- Mọi câu chuyện STAR phải dựa trên kinh nghiệm CÓ THẬT trong hồ sơ. Tuyệt đối không bịa dự án, con số hay công ty.',
      '- Hồ sơ thiếu dữ liệu cho một năng lực nào đó thì đưa năng lực đó vào likelyProbes, không dùng câu chuyện tưởng tượng để lấp chỗ trống.',
      '- Câu hỏi đề nghị ứng viên hỏi lại phải gắn với công ty và vị trí này, không phải câu hỏi chung chung.',
      '- Viết tiếng Việt có dấu. Mỗi trường là một đoạn văn hoàn chỉnh, không phải cụm từ rời rạc.',
      '',
      '--- KHUNG CHUẨN BỊ PHỎNG VẤN ---',
      framework,
      '',
      '--- HỒ SƠ HÀNH VI ---',
      behavioural,
    ].join('\n');

    const gapsBlock = match?.gaps.length
      ? [
          '',
          '=== KHOẢNG TRỐNG ĐÃ XÁC ĐỊNH KHI CHẤM ĐIỂM ===',
          ...match.gaps.map((gap) => `- ${gap}`),
          'Nhà tuyển dụng nhiều khả năng sẽ đào vào đúng những điểm này.',
        ].join('\n')
      : '';

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
      gapsBlock,
      '',
      '=== VỊ TRÍ ỨNG TUYỂN ===',
      `Chức danh: ${job.title}`,
      `Công ty: ${job.company}`,
      `Địa điểm: ${job.location ?? 'không rõ'}`,
      '',
      'Mô tả:',
      job.description,
    ].join('\n');

    return { system, prompt, skillHash: skill.contentHash };
  }

  async generate(
    userId: string,
    jobId: string,
    force = false,
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
    const hash = createHash('sha256')
      .update(skillHash)
      .update(profile ? JSON.stringify(profile) : 'no-profile')
      .update(job.description)
      .update(match?.gaps.join('|') ?? '')
      .digest('hex')
      .slice(0, 32);

    if (!force && existing?.status === 'DONE' && existing.promptHash === hash) {
      return existing;
    }

    await this.prisma.interviewPrep.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId, status: 'RUNNING' },
      update: { status: 'RUNNING', error: null },
    });

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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Soạn câu hỏi thất bại (job=${jobId}): ${message}`);
      return this.prisma.interviewPrep.update({
        where: { userId_jobId: { userId, jobId } },
        data: { status: 'FAILED', error: message },
      });
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
      yield { type: 'done', result: existing };
      return;
    }

    await this.prisma.interviewPrep.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId, status: 'RUNNING' },
      update: { status: 'RUNNING', error: null },
    });

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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Soạn câu hỏi (stream) thất bại (job=${jobId}): ${message}`,
      );
      await this.prisma.interviewPrep.update({
        where: { userId_jobId: { userId, jobId } },
        data: { status: 'FAILED', error: message },
      });
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
        include: { job: { select: { id: true, title: true, company: true } } },
      }),
      this.prisma.interviewPrep.count({ where }),
    ]);

    return pageOf(withFailureKinds(preps), total, query);
  }
}
