import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Profile, UpskillReport } from '../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/services/ai.service.js';
import { withFailureKind, withFailureKinds } from '../ai/failure-view.js';
import { PromptBuilderService } from '../skills/services/prompt-builder.service.js';
import { SkillRegistryService } from '../skills/services/skill-registry.service.js';
import type { ModelStreamEvent } from '../../common/stream-event.js';
import {
  upskillGapsSchema,
  upskillPlanSchema,
  type UpskillGaps,
  type UpskillPlan,
} from './upskill.schema.js';

const SKILL_NAME = 'upskill';

/**
 * Số công việc tối thiểu để báo cáo tổng hợp có ý nghĩa. Dưới ngưỡng này,
 * cái gọi là "xu hướng thị trường" chỉ là đặc điểm của vài tin tuyển dụng lẻ.
 */
const MIN_JOBS_FOR_AGGREGATE = 3;

/**
 * Lời gọi 1 mang theo tới 30 mô tả công việc nên nó là lời gọi có đầu vào lớn
 * nhất; lời gọi 2 chỉ nhận lại danh sách khoảng trống. Cộng lại vẫn đúng thứ tự
 * ràng buộc đã ghi trong CLAUDE.md: **mỗi** lời gọi < `server.setTimeout` 5 phút
 * < `STUCK_AFTER_MS` 10 phút, và tổng hai lời gọi cũng không chạm mốc 10 phút.
 */
const GAPS_TIMEOUT_MS = 180_000;
const PLAN_TIMEOUT_MS = 120_000;

/**
 * Chuỗi model ghi vào báo cáo. Hai lời gọi có thể rơi vào hai model khác nhau vì
 * chuỗi dự phòng đổi model khi gặp hạn mức, nên ghi mỗi một cái là ghi sai.
 */
function modelIdOf(gapsModelId: string, planModelId: string): string {
  return gapsModelId === planModelId
    ? planModelId
    : `${gapsModelId} + ${planModelId}`;
}

type ScoredJob = {
  overallScore: number | null;
  gaps: string[];
  job: {
    title: string;
    company: string;
    tags: string[];
    description: string;
  };
};

@Injectable()
export class UpskillService {
  private readonly logger = new Logger(UpskillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly skills: SkillRegistryService,
    private readonly prompts: PromptBuilderService,
  ) {}

  /**
   * Skill gốc đọc job_search_tracker.csv và dùng cột `fit_rating`. Ở đây bảng
   * job_matches đóng đúng vai trò đó, còn `overallScore` chính là fit_rating.
   */
  private async collectJobs(userId: string, jobId?: string) {
    if (jobId) {
      const match = await this.prisma.jobMatch.findUnique({
        where: { userId_jobId: { userId, jobId } },
        include: { job: true },
      });
      if (!match)
        throw new NotFoundException('Công việc này chưa được chấm điểm');
      return [match];
    }

    return this.prisma.jobMatch.findMany({
      where: { userId, status: 'DONE' },
      orderBy: { overallScore: 'asc' },
      take: 30,
      include: { job: true },
    });
  }

  /**
   * HAI lời gọi model, không phải một. Bản một-lời-gọi đã đo là không chạy nổi ở
   * chế độ AGGREGATE: nhồi 30 công việc vào một prompt rồi đòi sinh cả bốn trường
   * thì `deepseek-v4-flash-free` hết giờ ở mốc 240s, còn `mimo-v2.5-free` viết
   * xong sau 28s nhưng đánh rơi một dấu `{` nên cả JSON không parse được. Đây là
   * tách theo quan hệ dữ liệu chứ không phải cắt cho nhỏ — `learningPlan` vốn
   * phải suy từ khoảng trống, nên lời gọi 2 KHÔNG cần mô tả công việc.
   */
  async *streamGenerate(
    reportId: string,
  ): AsyncGenerator<ModelStreamEvent<UpskillReport>> {
    const report = await this.prisma.upskillReport.findUnique({
      where: { id: reportId },
    });
    if (!report)
      throw new NotFoundException(`Không tìm thấy báo cáo: ${reportId}`);

    await this.prisma.upskillReport.update({
      where: { id: reportId },
      data: { status: 'RUNNING', error: null },
    });

    try {
      const [profile, matches] = await Promise.all([
        this.prisma.profile.findUnique({ where: { userId: report.userId } }),
        this.collectJobs(report.userId, report.jobId ?? undefined),
      ]);

      if (!matches.length) {
        throw new BadRequestException(
          'Chưa có công việc nào được chấm điểm. Hãy nạp tin tuyển dụng trước.',
        );
      }
      if (
        report.mode === 'AGGREGATE' &&
        matches.length < MIN_JOBS_FOR_AGGREGATE
      ) {
        throw new BadRequestException(
          `Cần ít nhất ${MIN_JOBS_FOR_AGGREGATE} công việc đã chấm điểm để tổng hợp, hiện có ${matches.length}.`,
        );
      }

      const gapsPrompt = this.buildGapsPrompt(profile, matches);
      const gapsStream = await this.ai.streamObject<UpskillGaps>({
        schema: upskillGapsSchema,
        context: { purpose: 'upskill.gaps', userId: report.userId },
        system: gapsPrompt.system,
        prompt: gapsPrompt.prompt,
        timeoutMs: GAPS_TIMEOUT_MS,
      });

      for await (const partial of gapsStream.partials) {
        yield { type: 'partial', data: { step: 1, value: partial } };
      }
      const gaps = await gapsStream.object;

      await this.prisma.upskillReport.update({
        where: { id: reportId },
        data: {
          jobsAnalysed: matches.length,
          hardGaps: gaps.hardGaps,
          synthesisedGaps: gaps.synthesisedGaps,
        },
      });

      const planPrompt = this.buildPlanPrompt(profile, gaps);
      const planStream = await this.ai.streamObject<UpskillPlan>({
        schema: upskillPlanSchema,
        context: { purpose: 'upskill.plan', userId: report.userId },
        system: planPrompt.system,
        prompt: planPrompt.prompt,
        timeoutMs: PLAN_TIMEOUT_MS,
      });

      for await (const partial of planStream.partials) {
        yield { type: 'partial', data: { step: 2, value: partial } };
      }
      const plan = await planStream.object;

      yield {
        type: 'done',
        result: await this.prisma.upskillReport.update({
          where: { id: reportId },
          data: {
            status: 'DONE',
            jobsAnalysed: matches.length,
            hardGaps: gaps.hardGaps,
            synthesisedGaps: gaps.synthesisedGaps,
            learningPlan: plan.learningPlan,
            summary: plan.summary,
            modelId: modelIdOf(gapsStream.modelId, planStream.modelId),
            generatedAt: new Date(),
            error: null,
          },
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Tạo báo cáo upskill (stream) thất bại (${reportId}): ${message}`,
      );
      await this.prisma.upskillReport.update({
        where: { id: reportId },
        data: { status: 'FAILED', error: message },
      });
      yield { type: 'error', message };
    }
  }

  async generate(reportId: string): Promise<UpskillReport> {
    const report = await this.prisma.upskillReport.findUnique({
      where: { id: reportId },
    });
    if (!report)
      throw new NotFoundException(`Không tìm thấy báo cáo: ${reportId}`);

    await this.prisma.upskillReport.update({
      where: { id: reportId },
      data: { status: 'RUNNING', error: null },
    });

    try {
      const [profile, matches] = await Promise.all([
        this.prisma.profile.findUnique({ where: { userId: report.userId } }),
        this.collectJobs(report.userId, report.jobId ?? undefined),
      ]);

      if (!matches.length) {
        throw new BadRequestException(
          'Chưa có công việc nào được chấm điểm. Hãy nạp tin tuyển dụng trước.',
        );
      }
      if (
        report.mode === 'AGGREGATE' &&
        matches.length < MIN_JOBS_FOR_AGGREGATE
      ) {
        throw new BadRequestException(
          `Cần ít nhất ${MIN_JOBS_FOR_AGGREGATE} công việc đã chấm điểm để tổng hợp, hiện có ${matches.length}.`,
        );
      }

      const gapsPrompt = this.buildGapsPrompt(profile, matches);
      const gaps = await this.ai.generateObject<UpskillGaps>({
        schema: upskillGapsSchema,
        context: { purpose: 'upskill.gaps', userId: report.userId },
        system: gapsPrompt.system,
        prompt: gapsPrompt.prompt,
        timeoutMs: GAPS_TIMEOUT_MS,
      });

      await this.prisma.upskillReport.update({
        where: { id: reportId },
        data: {
          jobsAnalysed: matches.length,
          hardGaps: gaps.object.hardGaps,
          synthesisedGaps: gaps.object.synthesisedGaps,
        },
      });

      const planPrompt = this.buildPlanPrompt(profile, gaps.object);
      const plan = await this.ai.generateObject<UpskillPlan>({
        schema: upskillPlanSchema,
        context: { purpose: 'upskill.plan', userId: report.userId },
        system: planPrompt.system,
        prompt: planPrompt.prompt,
        timeoutMs: PLAN_TIMEOUT_MS,
      });

      return await this.prisma.upskillReport.update({
        where: { id: reportId },
        data: {
          status: 'DONE',
          jobsAnalysed: matches.length,
          hardGaps: gaps.object.hardGaps,
          synthesisedGaps: gaps.object.synthesisedGaps,
          learningPlan: plan.object.learningPlan,
          summary: plan.object.summary,
          modelId: modelIdOf(gaps.modelId, plan.modelId),
          generatedAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Tạo báo cáo upskill thất bại (${reportId}): ${message}`,
      );
      return this.prisma.upskillReport.update({
        where: { id: reportId },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  /** Khung phân tích lấy từ file skill, đã điền hồ sơ. */
  private framework(profile: Profile | null, sections: string[]): string {
    const skill = this.skills.get(SKILL_NAME);
    return this.prompts.render(
      this.prompts.keepSections(skill.body, sections),
      profile,
    );
  }

  /** Lời gọi 1 — mô tả công việc vào, khoảng trống ra. */
  private buildGapsPrompt(profile: Profile | null, matches: ScoredJob[]) {
    const system = [
      'Bạn là cố vấn phát triển nghề nghiệp. Nhiệm vụ của bạn ở bước này là TÌM KHOẢNG TRỐNG giữa hồ sơ ứng viên và các vị trí họ đang nhắm tới.',
      'Chưa đề xuất lộ trình học ở bước này — sẽ có một bước riêng làm việc đó.',
      '',
      'Quy tắc bắt buộc:',
      '- Chỉ liệt kê kỹ năng mà tin tuyển dụng THẬT SỰ đòi hỏi và hồ sơ THẬT SỰ chưa có. Kỹ năng hồ sơ đã có dù chỉ ở dạng tương đương thì bỏ qua.',
      '- Công việc có điểm phù hợp thấp đóng góp nhiều hơn vào độ ưu tiên: trọng số là (100 - điểm) / 100.',
      '- synthesisedGaps không được lặp lại bất kỳ mục nào trong hardGaps.',
      '- Viết tiếng Việt có dấu, mỗi trường là câu hoàn chỉnh.',
      '',
      '--- KHUNG PHÂN TÍCH ---',
      this.framework(profile, ['step 3', 'step 4', 'step 5']),
    ].join('\n');

    const jobLines = matches.map((match, index) => {
      const fit = match.overallScore ?? 0;
      const weight = ((100 - fit) / 100).toFixed(2);
      return [
        `${index + 1}. ${match.job.title} @ ${match.job.company}`,
        `   điểm phù hợp: ${fit}/100, trọng số gap: ${weight}`,
        `   từ khóa: ${match.job.tags.join(', ') || 'không có'}`,
        match.gaps.length
          ? `   khoảng trống đã ghi nhận: ${match.gaps.join('; ')}`
          : '',
        `   trích mô tả: ${match.job.description.slice(0, 600)}`,
      ]
        .filter(Boolean)
        .join('\n');
    });

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
      '',
      `=== ${matches.length} CÔNG VIỆC ĐÃ CHẤM ĐIỂM (sắp theo điểm tăng dần) ===`,
      ...jobLines,
    ].join('\n');

    return { system, prompt };
  }

  /**
   * Lời gọi 2 — khoảng trống vào, lộ trình học ra. Hồ sơ vẫn phải có mặt: lời
   * khuyên "bỏ qua phần cơ bản, vào thẳng mục X" chỉ đúng khi biết ứng viên đã
   * biết gì. Nhưng mô tả công việc thì KHÔNG, và đó là chỗ prompt nhỏ đi.
   */
  private buildPlanPrompt(profile: Profile | null, gaps: UpskillGaps) {
    const system = [
      'Bạn là cố vấn phát triển nghề nghiệp. Danh sách khoảng trống đã được phân tích xong ở bước trước; nhiệm vụ của bạn là biến nó thành LỘ TRÌNH HỌC.',
      '',
      'Quy tắc bắt buộc:',
      '- Chỉ lập lộ trình cho những khoảng trống được liệt kê dưới đây. Không thêm kỹ năng mới, không bỏ qua khoảng trống có priority cao.',
      '- Nguồn học phải là thứ có thật và gọi tên được. Không bịa URL.',
      '- Thứ tự học đi theo phụ thuộc trước, độ ưu tiên sau: cái nào mở khóa được nhiều thứ khác thì học trước.',
      '- Lời khuyên phải bám vào hồ sơ ứng viên: nói rõ chỗ nào bỏ qua được vì họ đã biết, chỗ nào phải học từ đầu.',
      '- Viết tiếng Việt có dấu, mỗi trường là câu hoàn chỉnh.',
      '',
      '--- KHUNG PHÂN TÍCH ---',
      this.framework(profile, ['step 6', 'step 7']),
    ].join('\n');

    // Sắp ở TypeScript chứ không tin model đã sắp: nhãn "sắp theo độ ưu tiên"
    // trong prompt phải đúng, không thì nó là một câu nói dối gửi cho model.
    const hardLines = [...gaps.hardGaps]
      .sort((a, b) => b.priority - a.priority)
      .map(
        (gap) =>
          `- ${gap.skill} (ưu tiên ${gap.priority}/100, ${gap.demandCount} công việc đòi hỏi): ${gap.evidence}`,
      );
    const synthesisedLines = gaps.synthesisedGaps.map(
      (gap) => `- [${gap.category}] ${gap.gap}: ${gap.why}`,
    );

    const prompt = [
      '=== HỒ SƠ ỨNG VIÊN ===',
      this.prompts.profileSummary(profile),
      '',
      '=== KHOẢNG TRỐNG KỸ NĂNG CỨNG (sắp theo độ ưu tiên) ===',
      ...(hardLines.length ? hardLines : ['(không có)']),
      '',
      '=== KHOẢNG TRỐNG SUY LUẬN ===',
      ...(synthesisedLines.length ? synthesisedLines : ['(không có)']),
    ].join('\n');

    return { system, prompt };
  }

  async create(userId: string, jobId?: string) {
    return this.prisma.upskillReport.create({
      data: {
        userId,
        jobId: jobId ?? null,
        mode: jobId ? 'TARGETED' : 'AGGREGATE',
      },
    });
  }

  async latest(userId: string) {
    const report = await this.prisma.upskillReport.findFirst({
      where: { userId, status: 'DONE' },
      orderBy: { createdAt: 'desc' },
    });
    if (!report) throw new NotFoundException('Chưa có báo cáo upskill nào');
    return withFailureKind(report);
  }

  async history(userId: string, query: PaginationQueryDto) {
    const where = { userId };

    const [reports, total] = await this.prisma.$transaction([
      this.prisma.upskillReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        select: {
          id: true,
          mode: true,
          status: true,
          jobsAnalysed: true,
          summary: true,
          createdAt: true,
          generatedAt: true,
          error: true,
        },
      }),
      this.prisma.upskillReport.count({ where }),
    ]);

    return pageOf(withFailureKinds(reports), total, query);
  }

  async get(userId: string, id: string) {
    const report = await this.prisma.upskillReport.findFirst({
      where: { id, userId },
    });
    if (!report) throw new NotFoundException(`Không tìm thấy báo cáo: ${id}`);
    return withFailureKind(report);
  }
}
