import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ProfileDraft } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
import type { StreamObjectOptions } from '@/modules/ai/ai.types';
import type { ModelStreamEvent } from '@/common/stream-event';
import { parseEvidenceList } from '../utils/evidence';
import {
  profileProposalSchema,
  type ProfileProposal,
} from '../profile-proposal.schema';
import {
  buildSynthesisPrompt,
  SYNTHESIS_SYSTEM,
  SYNTHESIS_TIMEOUT_MS,
} from '../utils/profile-synthesis.prompt';
import { streamFailureEvent } from '@/modules/ai/utils/failure-view';
import { messageOf } from '@/common/error-message';

@Injectable()
export class ProfileSynthesizerService {
  private readonly logger = new Logger(ProfileSynthesizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async *streamSynthesize(
    draftId: string,
  ): AsyncGenerator<ModelStreamEvent<ProfileDraft>> {
    const draft = await this.start(draftId);

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
  async synthesize(draftId: string): Promise<ProfileDraft> {
    const draft = await this.start(draftId);

    try {
      const { object, modelId } = await this.ai.generateObject(
        this.synthesisCall(draft),
      );
      return await this.finish(draftId, object, modelId);
    } catch (error) {
      return this.fail(draftId, error, 'Đọc hồ sơ');
    }
  }

  private async start(draftId: string): Promise<ProfileDraft> {
    const draft = await this.prisma.profileDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft) {
      throw new NotFoundException(`Không tìm thấy bản nháp hồ sơ: ${draftId}`);
    }

    await this.prisma.profileDraft.update({
      where: { id: draftId },
      data: { status: 'RUNNING', error: null },
    });
    return draft;
  }

  /** Ném khi không có bằng chứng — gọi trong `try` để bản nháp vẫn chuyển FAILED. */
  private synthesisCall(
    draft: ProfileDraft,
  ): StreamObjectOptions<ProfileProposal> {
    const evidence = parseEvidenceList(draft.evidence);
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
  ): Promise<ProfileDraft> {
    return this.prisma.profileDraft.update({
      where: { id: draftId },
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
  ): Promise<ProfileDraft> {
    const message = messageOf(error);
    this.logger.error(`${label} thất bại (${draftId}): ${message}`);
    return this.prisma.profileDraft.update({
      where: { id: draftId },
      data: { status: 'FAILED', error: message },
    });
  }
}
