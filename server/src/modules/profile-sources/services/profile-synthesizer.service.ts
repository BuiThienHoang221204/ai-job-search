import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ProfileDraft } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/services/ai.service';
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

    try {
      const evidence = parseEvidenceList(draft.evidence);
      if (evidence.length === 0) {
        throw new Error('Bản nháp không có bằng chứng nào đọc được');
      }

      const { partials, object, modelId } =
        await this.ai.streamObject<ProfileProposal>({
          schema: profileProposalSchema,
          context: { purpose: 'profile.synthesize', userId: draft.userId },
          system: SYNTHESIS_SYSTEM,
          prompt: buildSynthesisPrompt(evidence),
          timeoutMs: SYNTHESIS_TIMEOUT_MS,
        });

      for await (const partial of partials) {
        yield { type: 'partial', data: partial };
      }

      const final = await object;
      yield {
        type: 'done',
        result: await this.prisma.profileDraft.update({
          where: { id: draftId },
          data: {
            status: 'DONE',
            proposal: final,
            modelId,
            generatedAt: new Date(),
            error: null,
          },
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Đọc hồ sơ (stream) thất bại (${draftId}): ${message}`);
      await this.prisma.profileDraft.update({
        where: { id: draftId },
        data: { status: 'FAILED', error: message },
      });
      yield streamFailureEvent(error);
    }
  }

  /** Tổng hợp bản nháp: đọc bằng chứng đã lưu, gọi model MỘT LẦN, ghi đề xuất. */
  async synthesize(draftId: string): Promise<ProfileDraft> {
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

    try {
      const evidence = parseEvidenceList(draft.evidence);
      if (evidence.length === 0) {
        throw new Error('Bản nháp không có bằng chứng nào đọc được');
      }

      const { object, modelId } = await this.ai.generateObject<ProfileProposal>(
        {
          schema: profileProposalSchema,
          context: { purpose: 'profile.synthesize', userId: draft.userId },
          system: SYNTHESIS_SYSTEM,
          prompt: buildSynthesisPrompt(evidence),
          timeoutMs: SYNTHESIS_TIMEOUT_MS,
        },
      );

      return await this.prisma.profileDraft.update({
        where: { id: draftId },
        data: {
          status: 'DONE',
          proposal: object,
          modelId,
          generatedAt: new Date(),
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Đọc hồ sơ thất bại (${draftId}): ${message}`);
      return this.prisma.profileDraft.update({
        where: { id: draftId },
        data: { status: 'FAILED', error: message },
      });
    }
  }
}
