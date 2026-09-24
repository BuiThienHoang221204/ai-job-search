import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  QUEUE,
  QueueService,
  type AiShortlistPayload,
  type EvaluateMatchPayload,
  type ExtractRequirementsPayload,
  type RequirementMatchPayload,
  type SkillCanonicalizePayload,
} from '../queue/queue.service.js';
import { AiShortlistService } from './rules/services/ai-shortlist.service.js';
import { JobRequirementsService } from './ai/services/job-requirements.service.js';
import { MatchingService } from './ai/services/matching.service.js';
import { RequirementMatchService } from './rules/services/requirement-match.service.js';
import { SkillDictionaryService } from './ai/services/skill-dictionary.service.js';

/** Số cách viết mới xử lý trong MỘT lượt. Khớp lô hỏi model của service. */
const BATCH = 20;

/** Để lượt đối chiếu kịp ghi xong trước khi phát suất AI. */
const SETTLE_SECONDS = 60;

/** Một DÂY CHUYỀN năm chặng, gom một chỗ để đọc được thứ tự: EXTRACT_REQUIREMENTS → SKILL_CANONICALIZE → REQUIREMENT_MATCH → AI_SHORTLIST → EVALUATE_MATCH. */
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

  /** Pha A: rút yêu cầu của tin, rồi đẩy sang danh bạ kỹ năng. */
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

  /** Dựng danh bạ TRƯỚC rồi mới xếp lượt đối chiếu — đối chiếu sớm thì `Y tá` chưa khớp `Điều dưỡng` và phải đợi lượt sau. */
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

  /** Đối chiếu hồ sơ với yêu cầu đã rút. KHÔNG gọi model. */
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

  /** Chọn top-N tin đáng cho AI chấm. Đây là chốt chi phí của cả dây chuyền. */
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

  /** Mắt cuối: lượt gọi model thật cho MỘT cặp (user, job). */
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

  /** Tự nối vòng từng lô thay vì chạy một mạch: 1.616 cách viết ≈ 81 lượt gọi, mà bậc free khoá sau vài chục lượt. */
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
