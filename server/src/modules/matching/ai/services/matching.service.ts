import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  Job,
  JobMatch,
  Profile,
} from '../../../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../../../common/dto/pagination.dto.js';
import { STALE_RUNNING_MS } from '../../../../common/duration.js';
import { pageArgs, pageOf } from '../../../../common/pagination.js';
import { isUniqueViolation } from '../../../../prisma/prisma-errors.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { jobCardSelect } from '../../../jobs/job-card.select.js';
import { AiService } from '../../../ai/services/ai.service.js';
import type { ModelStreamEvent } from '../../../../common/stream-event.js';
import { PromptBuilderService } from '../../../skills/services/prompt-builder.service.js';
import { SkillRegistryService } from '../../../skills/services/skill-registry.service.js';
import {
  computeOverall,
  evaluationSchema,
  verdictFor,
  type Evaluation,
} from '../schemas/evaluation.schema.js';
import {
  LIST_FIELDS,
  promptHash,
  withSavedFlag,
  withStaleFlag,
  type EvaluationInputs,
} from '../utils/match-view.js';
import {
  evaluationPrompt,
  EVALUATION_SECTIONS,
} from '../prompt/evaluation.prompt.js';

const SKILL_NAME = 'job-application-assistant';
const REFERENCE_FILE = '04-job-evaluation.md';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly skills: SkillRegistryService,
    private readonly prompts: PromptBuilderService,
  ) {}

  private buildPrompt(profile: Profile | null, job: Job) {
    const skill = this.skills.get(SKILL_NAME);

    const selected = this.prompts.keepSections(
      skill.references.get(REFERENCE_FILE) ?? '',
      EVALUATION_SECTIONS,
    );
    const framework = this.prompts.render(
      this.prompts.dropSubsection(selected, 'Salary Benchmark'),
      profile,
    );

    return evaluationPrompt(
      framework,
      this.prompts.profileSummary(profile),
      job,
    );
  }

  /** Phần chung của đường đồng bộ và đường stream: đọc dữ liệu, dựng prompt, tính hash, giành quyền chấm. */
  private async prepare(
    userId: string,
    jobId: string,
    force: boolean,
  ): Promise<
    { cached: JobMatch } | { cached?: never; inputs: EvaluationInputs }
  > {
    const [profile, job, existing] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.job.findUnique({ where: { id: jobId } }),
      this.prisma.jobMatch.findUnique({
        where: { userId_jobId: { userId, jobId } },
      }),
    ]);

    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

    const { system, prompt } = this.buildPrompt(profile, job);
    const hash = promptHash(system, prompt);

    if (!force && existing?.status === 'DONE' && existing.promptHash === hash) {
      return { cached: existing };
    }

    if (!(await this.claim(userId, jobId))) {
      this.logger.debug(`Bỏ qua ${jobId}: tiến trình khác đang chấm cặp này`);
      return {
        cached: await this.prisma.jobMatch.findUniqueOrThrow({
          where: { userId_jobId: { userId, jobId } },
        }),
      };
    }

    return { inputs: { profile, job, system, prompt, hash } };
  }

  /** Ghi lỗi vào bản ghi rồi trả lại câu lỗi cho người gọi tự quyết cách báo. */
  private async fail(
    userId: string,
    jobId: string,
    error: unknown,
    label: string,
  ): Promise<{ match: JobMatch; message: string }> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `${label} thất bại (user=${userId} job=${jobId}): ${message}`,
    );
    const match = await this.prisma.jobMatch.update({
      where: { userId_jobId: { userId, jobId } },
      data: { status: 'FAILED', error: message },
    });
    return { match, message };
  }

  /** Chấm điểm một cặp (user, job) và lưu kết quả. */
  async evaluate(
    userId: string,
    jobId: string,
    force = false,
  ): Promise<JobMatch> {
    const ready = await this.prepare(userId, jobId, force);
    if (ready.cached) return ready.cached;
    const { system, prompt, hash } = ready.inputs;

    try {
      const { object, modelId } = await this.ai.generateObject<Evaluation>({
        schema: evaluationSchema,
        context: { purpose: 'match.evaluate', userId },
        system,
        prompt,
      });

      return await this.persist(userId, jobId, object, modelId, hash);
    } catch (error) {
      const { match } = await this.fail(userId, jobId, error, 'Chấm điểm');
      return match;
    }
  }

  async *streamEvaluate(
    userId: string,
    jobId: string,
    force = false,
  ): AsyncGenerator<ModelStreamEvent<JobMatch>> {
    const ready = await this.prepare(userId, jobId, force);
    if (ready.cached) {
      yield { type: 'done', result: ready.cached };
      return;
    }
    const { system, prompt, hash } = ready.inputs;

    try {
      const { partials, object, modelId } =
        await this.ai.streamObject<Evaluation>({
          schema: evaluationSchema,
          context: { purpose: 'match.evaluate', userId },
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
        'Chấm điểm (stream)',
      );
      yield { type: 'error', message };
    }
  }

  private persist(
    userId: string,
    jobId: string,
    object: Evaluation,
    modelId: string,
    hash: string,
  ) {
    const ineligible = object.eligibility.verdict === 'FAIL';
    const overall = ineligible ? 0 : computeOverall(object);

    return this.prisma.jobMatch.update({
      where: { userId_jobId: { userId, jobId } },
      data: {
        status: 'DONE',
        eligibility: object.eligibility.verdict,
        eligibilityQuote: object.eligibility.quote || null,
        eligibilityNote: object.eligibility.note,
        technicalScore: object.technical.score,
        technicalNote: object.technical.note,
        experienceScore: object.experience.score,
        experienceNote: object.experience.note,
        behavioralScore: object.behavioral.score,
        behavioralNote: object.behavioral.note,
        careerScore: object.career.score,
        careerNote: object.career.note,
        locationPass: object.location.pass,
        locationNote: object.location.note,
        overallScore: overall,
        verdict: ineligible ? 'POOR' : verdictFor(overall),
        strengths: object.strengths,
        gaps: object.gaps,
        recommendation: object.recommendation,
        modelId,
        promptHash: hash,
        evaluatedAt: new Date(),
        error: null,
      },
    });
  }

  /** Giành quyền chấm một cặp (user, job). */
  private async claim(userId: string, jobId: string): Promise<boolean> {
    const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);

    const claimed = await this.prisma.jobMatch.updateMany({
      where: {
        userId,
        jobId,
        OR: [
          { status: { not: 'RUNNING' } },
          { updatedAt: { lt: staleBefore } },
        ],
      },
      data: { status: 'RUNNING', error: null },
    });
    if (claimed.count > 0) return true;

    try {
      await this.prisma.jobMatch.create({
        data: { userId, jobId, status: 'RUNNING' },
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  private async profileUpdatedAt(userId: string): Promise<Date | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { updatedAt: true },
    });
    return profile?.updatedAt ?? null;
  }

  /** Danh sách kết quả đã chấm cho màn "Việc làm phù hợp". Chỉ đọc DB, không gọi AI. */
  async listMatches(userId: string, query: PaginationQueryDto = {}) {
    const where = { userId, status: 'DONE' as const };

    const [items, total, updatedAt] = await Promise.all([
      this.prisma.jobMatch.findMany({
        where,
        orderBy: { overallScore: 'desc' },
        ...pageArgs(query),
        // `select` chứ không `include`: `include` kéo về cả `description`, và
        // riêng cột đó là 42,7% dung lượng phản hồi này. Xem `job-card.select`.
        select: {
          ...LIST_FIELDS,
          job: { select: jobCardSelect(userId) },
        },
      }),
      this.prisma.jobMatch.count({ where }),
      this.profileUpdatedAt(userId),
    ]);

    return pageOf(
      items.map((match) => withStaleFlag(withSavedFlag(match), updatedAt)),
      total,
      query,
    );
  }

  async getMatch(userId: string, jobId: string) {
    const [match, updatedAt] = await Promise.all([
      this.prisma.jobMatch.findUnique({
        where: { userId_jobId: { userId, jobId } },
        include: {
          job: {
            include: { saves: { where: { userId }, select: { id: true } } },
          },
        },
      }),
      this.profileUpdatedAt(userId),
    ]);
    if (!match) throw new NotFoundException('Chưa chấm điểm công việc này');
    return withStaleFlag(withSavedFlag(match), updatedAt);
  }

  /** Chỉ `DONE` mới tính: `FAILED` là trạng thái cuối người dùng bấm lại được, `PENDING`/`RUNNING` để khoá dedup lo. */
  async findDoneScore(userId: string, jobId: string) {
    return this.prisma.jobMatch.findFirst({
      where: { userId, jobId, status: 'DONE' },
      select: { overallScore: true, verdict: true },
    });
  }

  /** Ghi `PENDING` NGAY lúc xếp hàng, để giao diện đọc trạng thái từ DB thay vì giữ "tôi vừa bấm" trong bộ nhớ trình duyệt. */
  async markPending(userId: string, jobId: string): Promise<void> {
    const revived = await this.prisma.jobMatch.updateMany({
      where: { userId, jobId, status: 'FAILED' },
      data: { status: 'PENDING', error: null },
    });
    if (revived.count > 0) return;

    try {
      await this.prisma.jobMatch.create({
        data: { userId, jobId, status: 'PENDING' },
      });
    } catch (error) {
      // Đã có bản ghi nghĩa là đang PENDING/RUNNING/DONE - không có gì để đổi.
      if (!isUniqueViolation(error)) throw error;
    }
  }
}
