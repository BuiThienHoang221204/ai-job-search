import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  Job,
  JobMatch,
  Profile,
} from '../../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../../common/pagination.js';
import { isUniqueViolation } from '../../../prisma/prisma-errors.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { jobCardSelect } from '../../jobs/job-card.select.js';
import { AiService } from '../../ai/services/ai.service.js';
import type { ModelStreamEvent } from '../../../common/stream-event.js';
import { PromptBuilderService } from '../../skills/services/prompt-builder.service.js';
import { SkillRegistryService } from '../../skills/services/skill-registry.service.js';
import {
  computeOverall,
  evaluationSchema,
  verdictFor,
  type Evaluation,
} from '../schemas/evaluation.schema.js';

const SKILL_NAME = 'job-application-assistant';
const REFERENCE_FILE = '04-job-evaluation.md';

/** Sau bao lâu thì một hàng còn ở trạng thái RUNNING được coi là bị bỏ rơi. */
export const STALE_RUNNING_MS = 5 * 60_000;

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly skills: SkillRegistryService,
    private readonly prompts: PromptBuilderService,
  ) {}

  /**
   * Vân tay của một lần chấm điểm: băm ĐÚNG thứ model nhìn thấy.
   *
   * Băm object hồ sơ thay vì prompt sẽ sai cả hai chiều — `updatedAt` làm mất
   * cache dù không đổi gì, còn `workMode`/`salaryRaw`/`tags` đổi thì không nhận ra.
   */
  private promptHash(system: string, prompt: string): string {
    return createHash('sha256')
      .update(system)
      .update(prompt)
      .digest('hex')
      .slice(0, 32);
  }

  private buildPrompt(profile: Profile | null, job: Job) {
    const skill = this.skills.get(SKILL_NAME);

    const selected = this.prompts.keepSections(
      skill.references.get(REFERENCE_FILE) ?? '',
      ['eligibility gate', 'scoring dimensions', 'weighting', 'thresholds'],
    );
    const framework = this.prompts.render(
      this.prompts.dropSubsection(selected, 'Salary Benchmark'),
      profile,
    );

    const system = [
      'Bạn là cố vấn nghề nghiệp, đánh giá mức độ phù hợp giữa một ứng viên và một tin tuyển dụng.',
      'Áp dụng ĐÚNG khung đánh giá dưới đây. Không tự bịa thêm chiều đánh giá mới.',
      '',
      'Quy tắc bắt buộc:',
      '- Chạy Eligibility Gate TRƯỚC, theo đúng thứ tự sau:',
      '  1. Tin đòi quốc tịch hoặc thường trú mà ứng viên không đáp ứng -> FAIL, kèm trích nguyên văn câu chữ đó.',
      '  2. Ứng viên là công dân của chính nước đặt vị trí tuyển dụng -> PASS.',
      '  3. Còn lại (tin im lặng về quyền làm việc và ứng viên không phải công dân nước sở tại) -> UNVERIFIED.',
      '- MỌI điểm đều chấm trên thang 0-100. Không dùng thang 0-5 hay 0-10.',
      '- Chỉ chấm điểm dựa trên thông tin có thật trong hồ sơ. Mục nào hồ sơ ghi "(hồ sơ chưa cung cấp thông tin này)" thì chấm điểm thấp và nói rõ là thiếu dữ liệu, tuyệt đối không suy diễn.',
      '- KHÔNG tính điểm tổng. Hệ thống tự tính theo trọng số.',
      '- Mọi ghi chú và mọi phần tử trong strengths/gaps phải là MỘT CÂU tiếng Việt có dấu hoàn chỉnh, không phải cụm từ rời rạc hay danh sách từ khóa.',
      '',
      '--- KHUNG ĐÁNH GIÁ ---',
      framework,
    ].join('\n');

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
      '',
      '=== TIN TUYỂN DỤNG ===',
      `Chức danh: ${job.title}`,
      `Công ty: ${job.company}`,
      `Địa điểm: ${job.location ?? 'không rõ'}`,
      `Hình thức: ${job.workMode ?? 'không rõ'}`,
      `Lương: ${job.salaryRaw ?? 'không công bố'}`,
      `Từ khóa: ${job.tags.join(', ') || 'không có'}`,
      '',
      'Mô tả:',
      job.description,
    ].join('\n');

    return { system, prompt };
  }

  /** Chấm điểm một cặp (user, job) và lưu kết quả. */
  async evaluate(
    userId: string,
    jobId: string,
    force = false,
  ): Promise<JobMatch> {
    const [profile, job, existing] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.job.findUnique({ where: { id: jobId } }),
      this.prisma.jobMatch.findUnique({
        where: { userId_jobId: { userId, jobId } },
      }),
    ]);

    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

    const { system, prompt } = this.buildPrompt(profile, job);
    const hash = this.promptHash(system, prompt);

    if (!force && existing?.status === 'DONE' && existing.promptHash === hash) {
      this.logger.debug(`Bỏ qua ${jobId}: đã chấm và chưa có gì thay đổi`);
      return existing;
    }

    if (!(await this.claim(userId, jobId))) {
      this.logger.debug(
        `Bỏ qua ${jobId}: một tiến trình khác đang chấm cặp này`,
      );
      return this.prisma.jobMatch.findUniqueOrThrow({
        where: { userId_jobId: { userId, jobId } },
      });
    }

    try {
      const { object, modelId } = await this.ai.generateObject<Evaluation>({
        schema: evaluationSchema,
        context: { purpose: 'match.evaluate', userId: userId },
        system,
        prompt,
      });

      return await this.persist(userId, jobId, object, modelId, hash);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Chấm điểm thất bại (user=${userId} job=${jobId}): ${message}`,
      );

      return this.prisma.jobMatch.update({
        where: { userId_jobId: { userId, jobId } },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  async *streamEvaluate(
    userId: string,
    jobId: string,
    force = false,
  ): AsyncGenerator<ModelStreamEvent<JobMatch>> {
    const [profile, job, existing] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.job.findUnique({ where: { id: jobId } }),
      this.prisma.jobMatch.findUnique({
        where: { userId_jobId: { userId, jobId } },
      }),
    ]);

    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

    const { system, prompt } = this.buildPrompt(profile, job);
    const hash = this.promptHash(system, prompt);

    if (!force && existing?.status === 'DONE' && existing.promptHash === hash) {
      yield { type: 'done', result: existing };
      return;
    }

    if (!(await this.claim(userId, jobId))) {
      yield {
        type: 'done',
        result: await this.prisma.jobMatch.findUniqueOrThrow({
          where: { userId_jobId: { userId, jobId } },
        }),
      };
      return;
    }

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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Chấm điểm (stream) thất bại (user=${userId} job=${jobId}): ${message}`,
      );
      await this.prisma.jobMatch.update({
        where: { userId_jobId: { userId, jobId } },
        data: { status: 'FAILED', error: message },
      });
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

  /**
   * Danh sách kết quả đã chấm, dùng cho màn hình "Việc làm phù hợp".
   * Chỉ đọc DB, không gọi AI.
   * Gắn cờ `saved` vào bản ghi job lồng bên trong.
   */
  private withSavedFlag<T extends { job: { saves: unknown[] } }>(match: T) {
    const { saves, ...job } = match.job;
    return { ...match, job: { ...job, saved: saves.length > 0 } };
  }

  /** Điểm chấm TRƯỚC lần sửa hồ sơ gần nhất thì không còn phản ánh hồ sơ hiện tại. */
  private withStaleFlag<T extends { evaluatedAt: Date | null }>(
    match: T,
    profileUpdatedAt: Date | null,
  ) {
    const stale =
      profileUpdatedAt !== null &&
      match.evaluatedAt !== null &&
      match.evaluatedAt < profileUpdatedAt;
    return { ...match, stale };
  }

  private async profileUpdatedAt(userId: string): Promise<Date | null> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { updatedAt: true },
    });
    return profile?.updatedAt ?? null;
  }

  /**
   * DANH SÁCH thì không mang theo văn xuôi dài — đó là việc của `getMatch`.
   *
   * Bảy trường `*Note` cộng `recommendation` là những đoạn model viết cho trang
   * chi tiết đọc; đo ngày 2026-08-22 chúng chiếm 21.608 byte trong một phản hồi
   * 20 dòng, và **không màn danh sách nào vẽ chúng ra**. `promptHash`/`modelId`
   * thì là dấu vết nội bộ của lượt gọi model.
   */
  private static readonly LIST_FIELDS = {
    id: true,
    userId: true,
    jobId: true,
    status: true,
    eligibility: true,
    overallScore: true,
    verdict: true,
    technicalScore: true,
    experienceScore: true,
    behavioralScore: true,
    careerScore: true,
    locationPass: true,
    strengths: true,
    gaps: true,
    evaluatedAt: true,
    createdAt: true,
    updatedAt: true,
  } as const;

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
          ...MatchingService.LIST_FIELDS,
          job: { select: jobCardSelect(userId) },
        },
      }),
      this.prisma.jobMatch.count({ where }),
      this.profileUpdatedAt(userId),
    ]);

    return pageOf(
      items.map((match) =>
        this.withStaleFlag(this.withSavedFlag(match), updatedAt),
      ),
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
    return this.withStaleFlag(this.withSavedFlag(match), updatedAt);
  }

  /**
   * Điểm đã có sẵn hay chưa, dùng để không xếp hàng một việc không có gì làm.
   *
   * Chỉ `DONE` mới tính. `FAILED` là trạng thái cuối người dùng bấm lại được,
   * còn `PENDING`/`RUNNING` thì khoá chặn trùng của hàng đợi lo.
   */
  async findDoneScore(userId: string, jobId: string) {
    return this.prisma.jobMatch.findFirst({
      where: { userId, jobId, status: 'DONE' },
      select: { overallScore: true, verdict: true },
    });
  }

  /**
   * Ghi `PENDING` ngay lúc xếp hàng, trước khi worker chạm tới.
   *
   * Nhờ vậy giao diện chỉ cần đọc trạng thái từ database là đủ, không phải giữ
   * "tôi vừa bấm" trong bộ nhớ trình duyệt - thứ mất sạch khi người dùng rời
   * trang, và chính là nguyên nhân nút chấm điểm quay về mặc định.
   */
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
