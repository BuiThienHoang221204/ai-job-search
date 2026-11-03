import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JobRequirement } from '@/generated/prisma/client';
import { estimateTokens } from '@/common/ai/token-estimate';
import { daysAgo } from '@/common/duration';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import { fastModelChain } from '@/modules/ai/utils/model-env';
import { JobRequirementsService } from '@/modules/matching/ai/services/job-requirements.service';
import { SkillDictionaryService } from '@/modules/matching/ai/services/skill-dictionary.service';
import {
  profileForJob,
  toMatchProfile,
  toRequirements,
} from '@/modules/matching/ai/utils/requirements';
import { profileSelect } from '@/modules/matching/rules/match-write';
import { matchRequirements } from '@/modules/matching/rules/requirement-match';
import { ExtJobsService } from '../jobs/ext-jobs.service';
import type { ExtSaveJobDto } from '../jobs/ext-jobs.dto';
import type { UpskillPlanDto } from './ext-upskill.dto';
import { gapView, type GapView } from './skill-gap';
import { planPrompt, planSchema } from './upskill-plan.prompt';

const PLAN_PURPOSE = 'ext.upskillPlan';
const MAX_PLAN_SKILLS = 20;

@Injectable()
export class ExtUpskillService {
  private readonly planDailyLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly extJobs: ExtJobsService,
    private readonly requirements: JobRequirementsService,
    private readonly dictionary: SkillDictionaryService,
    private readonly ai: AiService,
    config: ConfigService,
  ) {
    this.planDailyLimit = config.get<number>('upskill.planDailyLimit')!;
  }

  /** Kỹ năng còn thiếu cho một tin: lưu tin, đảm bảo đã rút yêu cầu (cache theo tin, dùng chung
   * mọi người), rồi đối chiếu hồ sơ người gọi bằng CODE — đường đọc gần như không gọi model. */
  async gaps(
    userId: string,
    dto: ExtSaveJobDto,
  ): Promise<GapView & { jobId: string }> {
    const { jobId } = await this.extJobs.save(userId, dto);

    const requirement = await this.requirements.extract(jobId);
    if (requirement.status !== 'DONE') {
      throw new BadRequestException(
        'Chưa đọc được yêu cầu của tin này, thử lại sau một chút.',
      );
    }

    const view = await this.matchFor(userId, jobId, requirement);
    if (!view) {
      throw new BadRequestException(
        'Hãy hoàn thiện hồ sơ (kỹ năng, kinh nghiệm) trước khi xem kỹ năng còn thiếu.',
      );
    }
    return view;
  }

  /** Kỹ năng còn thiếu cho một tin ĐÃ rút yêu cầu — đường ĐỌC auto-hiện, KHÔNG rút (không gọi model). Chưa có yêu cầu hoặc chưa có hồ sơ thì trả null. */
  async gapsForJob(
    userId: string,
    jobId: string,
  ): Promise<(GapView & { jobId: string }) | null> {
    const requirement = await this.prisma.jobRequirement.findUnique({
      where: { jobId },
    });
    if (!requirement || requirement.status !== 'DONE') return null;
    return this.matchFor(userId, jobId, requirement);
  }

  private async matchFor(
    userId: string,
    jobId: string,
    requirement: JobRequirement,
  ): Promise<(GapView & { jobId: string }) | null> {
    const [profile, job, dictionary] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId },
        select: profileSelect,
      }),
      this.prisma.job.findUnique({
        where: { id: jobId },
        select: { occupationCode: true },
      }),
      this.dictionary.lookup(),
    ]);
    if (!profile || !job) return null;
    const result = matchRequirements(
      toRequirements(requirement),
      profileForJob(toMatchProfile(profile), job.occupationCode),
      dictionary,
    );
    return { jobId, ...gapView(result) };
  }

  /** Gợi ý cách bổ sung các kỹ năng CÒN THIẾU (do code chốt, truyền từ tiến ích vào). Chặn
   * trước bằng hạn mức theo người (đếm `aiCall` 24h) để không vượt lượt AI. */
  async plan(userId: string, dto: UpskillPlanDto) {
    const skills = Array.from(
      new Set(dto.skills.map((skill) => skill.trim()).filter(Boolean)),
    ).slice(0, MAX_PLAN_SKILLS);
    if (skills.length === 0) {
      throw new BadRequestException(
        'Chưa có kỹ năng nào để gợi ý lộ trình học.',
      );
    }

    const used = await this.prisma.aiCall.count({
      where: {
        userId,
        purpose: PLAN_PURPOSE,
        ok: true,
        createdAt: { gte: daysAgo(1) },
      },
    });
    if (used >= this.planDailyLimit) {
      throw new HttpException(
        `Bạn đã dùng hết ${this.planDailyLimit} lượt gợi ý lộ trình trong 24 giờ qua. Quay lại sau nhé.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { system, prompt } = planPrompt(skills);
    const { object } = await this.ai.generateObject({
      schema: planSchema,
      context: { purpose: PLAN_PURPOSE, userId },
      system,
      prompt,
      ...fastModelChain(estimateTokens(system, prompt)),
    });

    return {
      items: object.items,
      remaining: Math.max(0, this.planDailyLimit - used - 1),
    };
  }
}
