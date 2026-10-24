import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ProfileDraft } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import type { StreamObjectOptions } from '@/modules/ai/ai.types';
import type { ModelStreamEvent } from '@/common/stream-event';
import type { Evidence } from '../utils/evidence';
import { WITHOUT_EVIDENCE, type DraftView } from '../utils/profile-draft.utils';
import {
  profileProposalSchema,
  type ProfileProposal,
} from '../profile-proposal.schema';
import {
  buildSynthesisPrompt,
  SYNTHESIS_SYSTEM,
  SYNTHESIS_TIMEOUT_MS,
} from '../utils/profile-synthesis.prompt';
import { streamFailureEvent } from '@/common/ai/failure-view';
import { messageOf } from '@/common/error-message';
import { STUCK_AFTER_MS } from '@/common/duration';

@Injectable()
export class ProfileSynthesizerService {
  private readonly logger = new Logger(ProfileSynthesizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async *streamSynthesize(
    userId: string,
    draftId: string,
  ): AsyncGenerator<ModelStreamEvent<DraftView>> {
    const { draft, claimed } = await this.start(userId, draftId);
    if (!claimed) {
      throw new ConflictException(
        'Bản nháp này đang được đọc hoặc đã đọc xong, không đọc lại được.',
      );
    }

    try {
      const { partials, object, modelId } = await this.ai.streamObject(
        this.synthesisCall(draft),
      );
      for await (const partial of partials) {
        yield { type: 'partial', data: partial };
      }
      yield {
        type: 'done',
        result: await this.finish(draftId, await object, modelId),
      };
    } catch (error) {
      await this.fail(draftId, error, 'Đọc hồ sơ (stream)');
      yield streamFailureEvent(error);
    }
  }

  /** Tổng hợp bản nháp: đọc bằng chứng đã lưu, gọi model MỘT LẦN, ghi đề xuất. */
  async synthesize(userId: string, draftId: string): Promise<DraftView | null> {
    const { draft, claimed } = await this.start(userId, draftId);
    if (!claimed) {
      this.logger.debug(`Bỏ qua bản nháp ${draftId}: đang ${draft.status}`);
      return null;
    }

    try {
      const { object, modelId } = await this.ai.generateObject(
        this.synthesisCall(draft),
      );
      return await this.finish(draftId, object, modelId);
    } catch (error) {
      return this.fail(draftId, error, 'Đọc hồ sơ');
    }
  }

  /** Giành chỗ RUNNING chỉ khi bản nháp đang chờ, đã hỏng, hoặc RUNNING đã kẹt — bản DONE không bao giờ bị đọc lại. */
  private async start(
    userId: string,
    draftId: string,
  ): Promise<{ draft: ProfileDraft; claimed: boolean }> {
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS);
    const claim = await this.prisma.profileDraft.updateMany({
      where: {
        id: draftId,
        userId,
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          { status: 'RUNNING', updatedAt: { lt: stuckBefore } },
        ],
      },
      data: { status: 'RUNNING', error: null },
    });

    const draft = await this.prisma.profileDraft.findFirst({
      where: { id: draftId, userId },
    });
    if (!draft) {
      throw new NotFoundException(`Không tìm thấy bản nháp hồ sơ: ${draftId}`);
    }

    return { draft, claimed: claim.count > 0 };
  }

  /** Ném khi không có bằng chứng — gọi trong `try` để bản nháp vẫn chuyển FAILED. */
  private synthesisCall(
    draft: ProfileDraft,
  ): StreamObjectOptions<ProfileProposal> {
    const evidence = Array.isArray(draft.evidence)
      ? (draft.evidence as unknown as Evidence[])
      : [];
    if (evidence.length === 0) {
      throw new Error('Bản nháp không có bằng chứng nào đọc được');
    }
    return {
      schema: profileProposalSchema,
      context: { purpose: 'profile.synthesize', userId: draft.userId },
      system: SYNTHESIS_SYSTEM,
      prompt: buildSynthesisPrompt(evidence),
      timeoutMs: SYNTHESIS_TIMEOUT_MS,
    };
  }

  private finish(
    draftId: string,
    proposal: ProfileProposal,
    modelId: string,
  ): Promise<DraftView> {
    return this.prisma.profileDraft.update({
      where: { id: draftId },
      omit: WITHOUT_EVIDENCE,
      data: {
        status: 'DONE',
        proposal,
        modelId,
        generatedAt: new Date(),
        error: null,
      },
    });
  }

  private async fail(
    draftId: string,
    error: unknown,
    label: string,
  ): Promise<DraftView> {
    const message = messageOf(error);
    this.logger.error(`${label} thất bại (${draftId}): ${message}`);
    return this.prisma.profileDraft.update({
      where: { id: draftId },
      data: { status: 'FAILED', error: message },
      omit: WITHOUT_EVIDENCE,
    });
  }
}
