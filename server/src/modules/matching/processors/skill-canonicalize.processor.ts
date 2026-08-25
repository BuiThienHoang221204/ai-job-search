import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  QUEUE,
  QueueService,
  type SkillCanonicalizePayload,
} from '../../queue/queue.service.js';
import { SkillDictionaryService } from '../services/skill-dictionary.service.js';

/** Số cách viết mới xử lý trong MỘT lượt. Khớp lô hỏi model của service. */
const BATCH = 20;

/**
 * Dựng danh bạ kỹ năng rồi mới xếp lượt đối chiếu.
 *
 * Thứ tự đó là cả lý do hàng đợi này tồn tại: đối chiếu trước khi danh bạ biết
 * `Y tá` là `Điều dưỡng` thì kết quả sai, và phải chờ tới lượt quét sau mới
 * đúng lại.
 */
@Injectable()
export class SkillCanonicalizeProcessor implements OnModuleInit {
  private readonly logger = new Logger(SkillCanonicalizeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly dictionary: SkillDictionaryService,
  ) {}

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

  /**
   * Dựng danh bạ cho TOÀN BỘ kho, mỗi lượt một lô rồi tự xếp lượt kế.
   *
   * Tự nối vòng thay vì chạy một mạch: 1.616 cách viết là khoảng 81 lượt gọi
   * model, và bậc miễn phí khoá sau vài chục lượt. Chia nhỏ thì một lô hỏng chỉ
   * mất lô đó, `round` trong khoá dedup giữ cho lượt kế không bị gộp vào lượt
   * đang chạy.
   */
  private async sweep(round: number): Promise<void> {
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

  async onModuleInit(): Promise<void> {
    await this.queue.work<SkillCanonicalizePayload>(
      QUEUE.SKILL_CANONICALIZE,
      async (data) => {
        if (data.round !== undefined) {
          await this.sweep(data.round);
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
}
