import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Job, JobMatch, Profile } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import { PromptBuilderService } from '../skills/prompt-builder.service.js';
import { SkillRegistryService } from '../skills/skill-registry.service.js';
import {
  computeOverall,
  evaluationSchema,
  verdictFor,
  type Evaluation,
} from './evaluation.schema.js';

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

  /// Vân tay của một lần chấm điểm.
  ///
  /// Gồm nội dung skill, hồ sơ và mô tả công việc. Bất kỳ thứ nào đổi thì hash
  /// đổi, và đó là tín hiệu duy nhất cho biết kết quả cũ đã hết giá trị. Nhờ
  /// nó mà mở dashboard 100 lần cũng không gọi AI thêm lần nào.
  private promptHash(
    skillHash: string,
    profile: Profile | null,
    job: Job,
  ): string {
    return createHash('sha256')
      .update(skillHash)
      .update(profile ? JSON.stringify(profile) : 'no-profile')
      .update(job.title)
      .update(job.company)
      .update(job.description)
      .update(job.location ?? '')
      .digest('hex')
      .slice(0, 32);
  }

  private buildPrompt(profile: Profile | null, job: Job) {
    const skill = this.skills.get(SKILL_NAME);

    // Chỉ lấy phần khung đánh giá. Xem PromptBuilderService.keepSections để
    // biết vì sao không được nhồi cả file vào prompt.
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

    return { system, prompt, skillHash: skill.contentHash };
  }

  /// Chấm điểm một cặp (user, job) và lưu kết quả.
  ///
  /// `force` bỏ qua kiểm tra hash để chấm lại khi người dùng bấm nút.
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

    const { system, prompt, skillHash } = this.buildPrompt(profile, job);
    const hash = this.promptHash(skillHash, profile, job);

    if (!force && existing?.status === 'DONE' && existing.promptHash === hash) {
      this.logger.debug(`Bỏ qua ${jobId}: đã chấm và chưa có gì thay đổi`);
      return existing;
    }

    await this.prisma.jobMatch.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId, status: 'RUNNING' },
      update: { status: 'RUNNING', error: null },
    });

    try {
      const { object, modelId } = await this.ai.generateObject<Evaluation>({
        schema: evaluationSchema,
        context: { purpose: 'match.evaluate', userId: userId },
        system,
        prompt,
      });

      // Eligibility FAIL là bộ lọc cứng: không chấm điểm, không soạn hồ sơ.
      // Vẫn lưu bản ghi để giao diện giải thích được vì sao công việc bị loại.
      const ineligible = object.eligibility.verdict === 'FAIL';
      const overall = ineligible ? 0 : computeOverall(object);

      return await this.prisma.jobMatch.update({
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

  /// Danh sách kết quả đã chấm, dùng cho màn hình "Việc làm phù hợp".
  /// Chỉ đọc DB, không gọi AI.
  /// Gắn cờ `saved` vào bản ghi job lồng bên trong.
  ///
  /// Màn hình "Việc làm phù hợp" hiện nút Lưu trên từng thẻ, mà nó đọc
  /// endpoint này chứ không đọc /api/jobs - nên cờ phải có ở cả hai chỗ.
  private withSavedFlag<T extends { job: { saves: unknown[] } }>(match: T) {
    const { saves, ...job } = match.job;
    return { ...match, job: { ...job, saved: saves.length > 0 } };
  }

  async listMatches(userId: string, limit = 20, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.jobMatch.findMany({
        where: { userId, status: 'DONE' },
        orderBy: { overallScore: 'desc' },
        take: limit,
        skip: offset,
        include: {
          job: {
            include: { saves: { where: { userId }, select: { id: true } } },
          },
        },
      }),
      this.prisma.jobMatch.count({ where: { userId, status: 'DONE' } }),
    ]);
    return {
      items: items.map((match) => this.withSavedFlag(match)),
      total,
      limit,
      offset,
    };
  }

  async getMatch(userId: string, jobId: string) {
    const match = await this.prisma.jobMatch.findUnique({
      where: { userId_jobId: { userId, jobId } },
      include: {
        job: {
          include: { saves: { where: { userId }, select: { id: true } } },
        },
      },
    });
    if (!match) throw new NotFoundException('Chưa chấm điểm công việc này');
    return this.withSavedFlag(match);
  }
}
