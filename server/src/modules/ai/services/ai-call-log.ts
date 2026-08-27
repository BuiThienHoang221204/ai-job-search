import type { Logger } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { FailureKind } from '../failure-kind.js';
import type { AiCallContext } from './ai.types.js';

export type AiCallEntry = {
  context: AiCallContext;
  provider: string;
  modelId: string;
  ok: boolean;
  durationMs: number;
  failureKind?: FailureKind;
  errorMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  finishReason?: string;
  responseText?: string;
};

/**
 * Sổ ghi mọi lượt gọi model - nguồn của bảng `ai_calls` và màn `ai-health`.
 *
 * Ghi được hay không là việc PHỤ, nên `record` nuốt lỗi của chính nó: một
 * bảng hỏng không được phép giết một lời gọi model đã tốn tiền và đã xong.
 */
export class AiCallLog {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  /** Ghi lại một lần gọi. KHÔNG bao giờ được làm hỏng lần gọi thật. */
  async record(entry: AiCallEntry): Promise<void> {
    try {
      await this.prisma.aiCall.create({
        data: {
          userId: entry.context.userId ?? null,
          purpose: entry.context.purpose,
          provider: entry.provider,
          modelId: entry.modelId,
          ok: entry.ok,
          durationMs: entry.durationMs,
          failureKind: entry.failureKind ?? null,
          errorMessage: entry.errorMessage ?? null,
          inputTokens: entry.inputTokens ?? null,
          cachedTokens: entry.cachedTokens ?? null,
          outputTokens: entry.outputTokens ?? null,
          finishReason: entry.finishReason ?? null,
          responseText: entry.responseText ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Không ghi được nhật ký AiCall: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
