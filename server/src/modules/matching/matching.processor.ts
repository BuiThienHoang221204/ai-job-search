import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  QUEUE,
  QueueService,
  type AiShortlistPayload,
  type EvaluateMatchPayload,
  type ExtractRequirementsPayload,
  type RequirementMatchPayload,
  type SkillCanonicalizePayload,
} from '../queue/queue.service';
import { AiShortlistService } from './rules/services/ai-shortlist.service';
import { JobRequirementsService } from './ai/services/job-requirements.service';
import { MatchingService } from './ai/services/matching.service';
import { RequirementMatchService } from './rules/services/requirement-match.service';
import { SkillDictionaryService } from './ai/services/skill-dictionary.service';

const BATCH = 20;

const SETTLE_SECONDS = 60;

@Injectable()
export class MatchingProcessor implements OnModuleInit {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly requirements: JobRequirementsService,
    private readonly dictionary: SkillDictionaryService,
    private readonly matches: RequirementMatchService,
    private readonly shortlist: AiShortlistService,
    private readonly matching: MatchingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.workExtractRequirements();
    await this.workSkillCanonicalize();
    await this.workRequirementMatch();
    await this.workAiShortlist();
    await this.workEvaluateMatch();
  }

  private workExtractRequirements(): Promise<void> {
    return this.queue.work<ExtractRequirementsPayload>(
      QUEUE.EXTRACT_REQUIREMENTS,
      async (data) => {
        this.logger.log(`Rút yêu cầu cho lô ${data.jobIds.length} tin`);
        const results = await this.requirements.extractMany(
          data.jobIds,
          data.force ?? false,
        );

        for (const result of results) {
          if (result.status !== 'DONE') continue;
          await this.queue.send(QUEUE.SKILL_CANONICALIZE, {
            jobId: result.jobId,
          });
        }
      },
    );
  }

  private workSkillCanonicalize(): Promise<void> {
    return this.queue.work<SkillCanonicalizePayload>(
      QUEUE.SKILL_CANONICALIZE,
      async (data) => {
        if (data.round !== undefined) {
          await this.sweepDictionary(data.round);
          return;
        }

        const terms = data.jobId
          ? await this.termsOfJob(data.jobId)
          : data.userId
            ? await this.termsOfUser(data.userId)
            : null;

        if (terms === null) {
          throw new Error('Payload danh bạ phải có jobId, userId hoặc round.');
        }

        const { added } = await this.dictionary.ingest(terms, BATCH);
        this.logger.log(
          `Danh bạ ${data.jobId ? `job=${data.jobId}` : `user=${data.userId}`}: thêm ${added}`,
        );

        await this.queue.send(QUEUE.REQUIREMENT_MATCH, data);
      },
    );
  }

  private workRequirementMatch(): Promise<void> {
    return this.queue.work<RequirementMatchPayload>(
      QUEUE.REQUIREMENT_MATCH,
      async (data) => {
        if (data.jobId) {
          this.logger.log(`Đối chiếu tin job=${data.jobId} với mọi hồ sơ`);
          await this.matches.scoreJob(data.jobId);
          await this.handOverToShortlist();
          return;
        }
        if (data.userId) {
          this.logger.log(`Đối chiếu hồ sơ user=${data.userId} với mọi tin`);
          await this.matches.scoreUser(data.userId);
          await this.handOverToShortlist(data.userId);
          return;
        }
        this.logger.log('Đối chiếu lại toàn bộ kho');
        await this.matches.scoreAll();
        await this.handOverToShortlist();
      },
    );
  }

  private workAiShortlist(): Promise<void> {
    return this.queue.work<AiShortlistPayload>(
      QUEUE.AI_SHORTLIST,
      async (data) => {
        this.logger.log(
          data.userId
            ? `Chọn tin cho AI chấm: user=${data.userId}`
            : 'Chọn tin cho AI chấm: mọi hồ sơ',
        );
        await this.shortlist.dispatch(data.userId);
      },
    );
  }

  private workEvaluateMatch(): Promise<void> {
    return this.queue.work<EvaluateMatchPayload>(
      QUEUE.EVALUATE_MATCH,
      async (data) => {
        this.logger.log(`Chấm điểm user=${data.userId} job=${data.jobId}`);
        await this.matching.evaluate(
          data.userId,
          data.jobId,
          data.force ?? false,
        );
      },
    );
  }

  private handOverToShortlist(userId?: string): Promise<string | null> {
    return this.queue.send(QUEUE.AI_SHORTLIST, userId ? { userId } : {}, {
      startAfter: SETTLE_SECONDS,
    });
  }

  private async termsOfJob(jobId: string): Promise<string[]> {
    const row = await this.prisma.jobRequirement.findUnique({
      where: { jobId },
      select: { requiredSkills: true, niceToHaveSkills: true },
    });
    return row ? [...row.requiredSkills, ...row.niceToHaveSkills] : [];
  }

  private async termsOfUser(userId: string): Promise<string[]> {
    const row = await this.prisma.profile.findUnique({
      where: { userId },
      select: { headline: true, primarySkills: true, secondarySkills: true },
    });
    if (!row) return [];
    return [
      ...(row.headline ? [row.headline] : []),
      ...row.primarySkills,
      ...row.secondarySkills,
    ];
  }

  private async sweepDictionary(round: number): Promise<void> {
    const terms = await this.dictionary.allTerms();
    const { added, remaining } = await this.dictionary.ingest(terms, BATCH);
    this.logger.log(
      `Danh bạ (quét toàn kho, vòng ${round}): thêm ${added}, còn ${remaining}`,
    );

    if (remaining > 0 && added > 0) {
      await this.queue.send(QUEUE.SKILL_CANONICALIZE, { round: round + 1 });
      return;
    }

    await this.queue.send(QUEUE.REQUIREMENT_MATCH, {});
  }
}
