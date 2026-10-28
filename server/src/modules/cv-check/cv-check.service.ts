import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '@/modules/ai/services/ai.service';
import { fastModelChain } from '@/modules/ai/utils/model-env';
import { estimateTokens } from '@/common/ai/token-estimate';
import { messageOf } from '@/common/error-message';
import { cvReviewSchema } from './cv-check.schema';
import type { CvCheckDto } from './cv-check.dto';
import { GuestQuotaService } from './guest-quota.service';
import {
  CV_CHECK_MAX_OUTPUT_TOKENS,
  CV_CHECK_SYSTEM,
  CV_CHECK_TIMEOUT_MS,
  cvCheckPrompt,
} from './utils/cv-check.prompt';
import { keepVerbatim, segmentByLayout } from './utils/cv-lines';
import { verifyReview } from './utils/cv-review';
import { hasTextLayer, scoreCv } from './utils/cv-score';
import { guestKeyOf, vnDay } from './utils/guest';

const PURPOSE = 'guest.cvCheck';

type QuickReason = 'no-text' | 'guest-limit' | 'daily-limit' | 'ai-failed';

@Injectable()
export class CvCheckService {
  private readonly logger = new Logger(CvCheckService.name);
  private readonly secret: string;

  constructor(
    private readonly ai: AiService,
    private readonly quota: GuestQuotaService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('cvCheck.guestKeySecret')!;
  }

  async check(ip: string, input: CvCheckDto) {
    if (!hasTextLayer(input)) return this.quick(input, 'no-text');

    const guestKey = guestKeyOf(ip, this.secret);
    const day = vnDay(Date.now());
    const claim = await this.quota.claim(guestKey, day);
    if (!claim.granted) return this.quick(input, claim.reason);

    try {
      const prompt = cvCheckPrompt(input.text, day);
      const { object } = await this.ai.generateObject({
        schema: cvReviewSchema,
        context: { purpose: PURPOSE, redactResponse: true },
        system: CV_CHECK_SYSTEM,
        prompt,
        timeoutMs: CV_CHECK_TIMEOUT_MS,
        maxOutputTokens: CV_CHECK_MAX_OUTPUT_TOKENS,
        ...fastModelChain(estimateTokens(CV_CHECK_SYSTEM, prompt)),
      });
      const bullets = keepVerbatim(object.bullets, input.text);
      return {
        ...scoreCv({
          ...input,
          sections: object.sections,
          bullets:
            bullets.length > 0 ? bullets : segmentByLayout(input.text).bullets,
        }),
        mode: 'ai' as const,
        reason: null,
        review: verifyReview(object, input.text),
        aiRemaining: claim.remaining,
      };
    } catch (error) {
      this.logger.warn(
        `Chấm CV cho khách: AI hỏng, chấm nhanh: ${messageOf(error)}`,
      );
      await this.quota.refund(guestKey, day);
      return this.quick(input, 'ai-failed');
    }
  }

  private quick(input: CvCheckDto, reason: QuickReason) {
    return {
      ...scoreCv({ ...input, ...segmentByLayout(input.text) }),
      mode: 'quick' as const,
      reason,
      review: null,
      aiRemaining: null,
    };
  }
}
