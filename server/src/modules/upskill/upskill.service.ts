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
import {
  withFailureKind,
  withFailureKinds,
  streamFailureEvent,
} from '../ai/utils/failure-view.js';
import { PromptBuilderService } from '../skills/services/prompt-builder.service.js';
import { SkillRegistryService } from '../skills/services/skill-registry.service.js';
import type { ModelStreamEvent } from '../../common/stream-event.js';
import {
  upskillGapsSchema,
  upskillPlanSchema,
  type UpskillGaps,
  type UpskillPlan,
} from './upskill.schema.js';
import {
  gapsPrompt,
  planPrompt,
  GAPS_SECTIONS,
  PLAN_SECTIONS,
  type ScoredJob,
} from './utils/upskill.prompt.js';

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
    const include = { job: { include: { requirements: true } } };

    if (jobId) {
      const match = await this.prisma.jobMatch.findUnique({
        where: { userId_jobId: { userId, jobId } },
        include,
      });
      if (!match)
        throw new NotFoundException('Công việc này chưa được chấm điểm');
      return [match];
    }

    return this.prisma.jobMatch.findMany({
      where: { userId, status: 'DONE' },
      orderBy: { overallScore: 'asc' },
      take: 30,
      include,
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
      yield streamFailureEvent(error);
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

  /** Lời gọi 1 — yêu cầu của tin vào, khoảng trống ra. */
  private buildGapsPrompt(profile: Profile | null, matches: ScoredJob[]) {
    return gapsPrompt(
      this.framework(profile, GAPS_SECTIONS),
      this.prompts.profileSummary(profile),
      matches,
    );
  }

  /** Lời gọi 2 — hồ sơ vẫn phải có mặt để biết chỗ nào bỏ qua được, nhưng mô tả công việc thì KHÔNG. */
  private buildPlanPrompt(profile: Profile | null, gaps: UpskillGaps) {
    return planPrompt(
      this.framework(profile, PLAN_SECTIONS),
      this.prompts.profileSummary(profile),
      gaps,
    );
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
