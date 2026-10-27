import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import { fastModelChain } from '@/modules/ai/utils/model-env';
import { estimateTokens } from '@/common/ai/token-estimate';
import { daysAgo } from '@/common/duration';
import { bulletRewriteSchema } from '../schemas/document.schema';
import {
  BULLET_REWRITE_TIMEOUT_MS,
  REWRITE_MAX_CHARS,
  bulletFacts,
  bulletRewritePrompt,
  guardSuggestions,
  tooVague,
  type BulletInput,
} from '../utils/bullet-rewrite';

const PURPOSE = 'document.bulletRewrite';

@Injectable()
export class BulletRewriteService {
  private readonly dailyLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    config: ConfigService,
  ) {
    this.dailyLimit = config.get<number>('documents.bulletRewriteDailyLimit')!;
  }

  async rewrite(userId: string, documentId: string, input: BulletInput) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, userId, kind: 'CV' },
      select: { jobId: true, language: true },
    });
    if (!document) throw new NotFoundException('Không tìm thấy CV này.');

    if (tooVague(input.kind, input.text)) {
      throw new BadRequestException(
        'Chỗ này chưa nói bạn đã làm gì nên AI không có gì để viết lại mà không bịa. Thêm một ý cụ thể (làm việc gì, dùng công cụ gì) rồi bấm lại.',
      );
    }

    const used = await this.prisma.aiCall.count({
      where: {
        userId,
        purpose: PURPOSE,
        ok: true,
        createdAt: { gte: daysAgo(1) },
      },
    });
    if (used >= this.dailyLimit) {
      throw new HttpException(
        `Bạn đã dùng hết ${this.dailyLimit} lượt gợi ý viết lại trong 24 giờ qua. Bạn vẫn sửa tay được như bình thường, hoặc quay lại sau.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const [profile, job] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { userId },
        select: { primarySkills: true, secondarySkills: true },
      }),
      document.jobId
        ? this.prisma.job.findUnique({
            where: { id: document.jobId },
            select: {
              title: true,
              requirements: {
                select: { requiredSkills: true, niceToHaveSkills: true },
              },
            },
          })
        : null,
    ]);

    const facts = bulletFacts({
      profile,
      requirements: job?.requirements ?? null,
      jobTitle: job?.title ?? null,
    });
    const language = document.language === 'EN' ? 'en' : 'vi';
    const { system, prompt } = bulletRewritePrompt(input, facts, language);

    const { object } = await this.ai.generateObject({
      schema: bulletRewriteSchema(language, REWRITE_MAX_CHARS[input.kind]),
      context: { purpose: PURPOSE, userId },
      system,
      prompt,
      timeoutMs: BULLET_REWRITE_TIMEOUT_MS,
      ...fastModelChain(estimateTokens(system, prompt)),
    });

    const suggestions = guardSuggestions(object.suggestions, input.text, facts);
    if (suggestions.length === 0) {
      throw new UnprocessableEntityException(
        'AI chưa viết được cách nào đúng sự thật cho dòng này. Thêm một ý cụ thể rồi bấm lại, hoặc sửa tay.',
      );
    }

    return {
      suggestions,
      remaining: Math.max(0, this.dailyLimit - used - 1),
    };
  }
}
