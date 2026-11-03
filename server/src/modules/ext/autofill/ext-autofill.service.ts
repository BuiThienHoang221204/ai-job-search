import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { estimateTokens } from '@/common/ai/token-estimate';
import { daysAgo } from '@/common/duration';
import { AiService } from '@/modules/ai/services/ai.service';
import { fastModelChain } from '@/modules/ai/utils/model-env';
import { PrismaService } from '@/prisma/prisma.service';
import { ExtProfileService } from '../profile/ext-profile.service';
import { answerPrompt, answerSchema } from './autofill-answer.prompt';
import type { AutofillAnswerDto } from './ext-autofill.dto';

const PURPOSE = 'ext.autofillAnswer';

@Injectable()
export class ExtAutofillService {
  private readonly dailyLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly profiles: ExtProfileService,
    config: ConfigService,
  ) {
    this.dailyLimit = config.get<number>('autofill.answerDailyLimit')!;
  }

  /** Nhờ AI soạn câu trả lời tự luận cho một ô đơn ứng tuyển, từ hồ sơ người gọi. Chặn trước bằng hạn mức theo người (đếm `aiCall` 24h) để không vượt lượt AI. */
  async answer(userId: string, dto: AutofillAnswerDto) {
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
        `Bạn đã dùng hết ${this.dailyLimit} lượt nhờ AI viết trong 24 giờ qua. Quay lại sau nhé.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const data = await this.profiles.autofill(userId);
    const { system, prompt } = answerPrompt(
      data,
      dto.question,
      dto.role,
      dto.company,
    );
    const { object } = await this.ai.generateObject({
      schema: answerSchema,
      context: { purpose: PURPOSE, userId },
      system,
      prompt,
      ...fastModelChain(estimateTokens(system, prompt)),
    });

    return {
      answer: object.answer,
      remaining: Math.max(0, this.dailyLimit - used - 1),
    };
  }
}
