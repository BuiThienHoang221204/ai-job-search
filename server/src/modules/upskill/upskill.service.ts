import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Profile, UpskillReport } from '@/generated/prisma/client';
import type { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { pageArgs, pageOf } from '@/common/pagination';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '../ai/services/ai.service';
import {
  withFailureKind,
  withFailureKinds,
  streamFailureEvent,
} from '../ai/utils/failure-view';
import { PromptBuilderService } from '../skills/services/prompt-builder.service';
import { SkillRegistryService } from '../skills/services/skill-registry.service';
import type { ModelStreamEvent } from '@/common/stream-event';
import type { StreamObjectOptions } from '../ai/ai.types';
import {
  upskillGapsSchema,
  upskillPlanSchema,
  type UpskillGaps,
  type UpskillPlan,
} from './upskill.schema';
import {
  gapsPrompt,
  planPrompt,
  GAPS_SECTIONS,
  PLAN_SECTIONS,
  type ScoredJob,
} from './utils/upskill.prompt';
import { messageOf } from '@/common/error-message';

const SKILL_NAME = 'upskill';

/** Dưới ngưỡng này, "xu hướng thị trường" chỉ là đặc điểm của vài tin lẻ. */
const MIN_JOBS_FOR_AGGREGATE = 3;

/** Lời gọi 1 mang tới 30 mô tả công việc nên hạn dài hơn; mỗi lời gọi < `server.setTimeout` 5' và tổng hai lời gọi < `STUCK_AFTER_MS` 10'. */
const GAPS_TIMEOUT_MS = 180_000;
const PLAN_TIMEOUT_MS = 120_000;

/** Hai lời gọi có thể rơi vào hai model khác nhau (chuỗi dự phòng), nên ghi một cái là ghi sai. */
function modelIdOf(gapsModelId: string, planModelId: string): string {
  return gapsModelId === planModelId
    ? planModelId
    : `${gapsModelId} + ${planModelId}`;
}

type Prepared = {
  report: UpskillReport;
  profile: Profile | null;
  matches: ScoredJob[];
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

  /** `job_matches` đóng vai `job_search_tracker.csv` của skill gốc, `overallScore` chính là `fit_rating`. */
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

  /** HAI lời gọi model (khoảng trống → lộ trình), không phải một — bản một-lời-gọi đã đo là không chạy nổi ở AGGREGATE, xem CLAUDE.md. */
  async *streamGenerate(
    reportId: string,
  ): AsyncGenerator<ModelStreamEvent<UpskillReport>> {
    const report = await this.start(reportId);

    try {
      const prepared = await this.prepare(report);

      const gapsStream = await this.ai.streamObject(this.gapsCall(prepared));
      for await (const partial of gapsStream.partials) {
        yield { type: 'partial', data: { step: 1, value: partial } };
      }
      const gaps = await gapsStream.object;
      await this.saveGaps(prepared, gaps);

      const planStream = await this.ai.streamObject(
        this.planCall(prepared, gaps),
      );
      for await (const partial of planStream.partials) {
        yield { type: 'partial', data: { step: 2, value: partial } };
      }
      const plan = await planStream.object;

      yield {
        type: 'done',
        result: await this.finish(
          prepared,
          gaps,
          plan,
          modelIdOf(gapsStream.modelId, planStream.modelId),
        ),
      };
    } catch (error) {
      await this.fail(reportId, error, 'Tạo báo cáo upskill (stream)');
      yield streamFailureEvent(error);
    }
  }

  async generate(reportId: string): Promise<UpskillReport> {
    const report = await this.start(reportId);

    try {
      const prepared = await this.prepare(report);

      const gaps = await this.ai.generateObject(this.gapsCall(prepared));
      await this.saveGaps(prepared, gaps.object);

      const plan = await this.ai.generateObject(
        this.planCall(prepared, gaps.object),
      );

      return await this.finish(
        prepared,
        gaps.object,
        plan.object,
        modelIdOf(gaps.modelId, plan.modelId),
      );
    } catch (error) {
      return this.fail(reportId, error, 'Tạo báo cáo upskill');
    }
  }

  private async start(reportId: string): Promise<UpskillReport> {
    const report = await this.prisma.upskillReport.findUnique({
      where: { id: reportId },
    });
    if (!report)
      throw new NotFoundException(`Không tìm thấy báo cáo: ${reportId}`);

    await this.prisma.upskillReport.update({
      where: { id: reportId },
      data: { status: 'RUNNING', error: null },
    });
    return report;
  }

  private async prepare(report: UpskillReport): Promise<Prepared> {
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
    return { report, profile, matches };
  }

  /** Lời gọi 1 — yêu cầu của tin vào, khoảng trống ra. */
  private gapsCall({
    report,
    profile,
    matches,
  }: Prepared): StreamObjectOptions<UpskillGaps> {
    return {
      schema: upskillGapsSchema,
      context: { purpose: 'upskill.gaps', userId: report.userId },
      ...gapsPrompt(
        this.framework(profile, GAPS_SECTIONS),
        this.prompts.profileSummary(profile),
        matches,
      ),
      timeoutMs: GAPS_TIMEOUT_MS,
    };
  }

  /** Lời gọi 2 — hồ sơ vẫn phải có mặt để biết chỗ nào bỏ qua được, nhưng mô tả công việc thì KHÔNG. */
  private planCall(
    { report, profile }: Prepared,
    gaps: UpskillGaps,
  ): StreamObjectOptions<UpskillPlan> {
    return {
      schema: upskillPlanSchema,
      context: { purpose: 'upskill.plan', userId: report.userId },
      ...planPrompt(
        this.framework(profile, PLAN_SECTIONS),
        this.prompts.profileSummary(profile),
        gaps,
      ),
      timeoutMs: PLAN_TIMEOUT_MS,
    };
  }

  /** Lưu khoảng trống ngay sau lời gọi 1, để lời gọi 2 hỏng thì công của lời gọi 1 không mất. */
  private saveGaps({ report, matches }: Prepared, gaps: UpskillGaps) {
    return this.prisma.upskillReport.update({
      where: { id: report.id },
      data: {
        jobsAnalysed: matches.length,
        hardGaps: gaps.hardGaps,
        synthesisedGaps: gaps.synthesisedGaps,
      },
    });
  }

  private finish(
    { report, matches }: Prepared,
    gaps: UpskillGaps,
    plan: UpskillPlan,
    modelId: string,
  ): Promise<UpskillReport> {
    return this.prisma.upskillReport.update({
      where: { id: report.id },
      data: {
        status: 'DONE',
        jobsAnalysed: matches.length,
        hardGaps: gaps.hardGaps,
        synthesisedGaps: gaps.synthesisedGaps,
        learningPlan: plan.learningPlan,
        summary: plan.summary,
        modelId,
        generatedAt: new Date(),
        error: null,
      },
    });
  }

  private async fail(
    reportId: string,
    error: unknown,
    label: string,
  ): Promise<UpskillReport> {
    const message = messageOf(error);
    this.logger.error(`${label} thất bại (${reportId}): ${message}`);
    return this.prisma.upskillReport.update({
      where: { id: reportId },
      data: { status: 'FAILED', error: message },
    });
  }

  /** Khung phân tích lấy từ file skill, đã điền hồ sơ. */
  private framework(profile: Profile | null, sections: string[]): string {
    const skill = this.skills.get(SKILL_NAME);
    return this.prompts.render(
      this.prompts.keepSections(skill.body, sections),
      profile,
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
