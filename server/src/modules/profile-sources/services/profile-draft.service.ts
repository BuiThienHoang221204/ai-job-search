import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, ProfileDraft } from '../../../generated/prisma/client.js';
import type { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { pageArgs, pageOf } from '../../../common/pagination.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  QUEUE,
  QueueService,
  type ProfileSynthesizePayload,
} from '../../queue/queue.service.js';
import {
  STORAGE,
  userKey,
  type Storage,
} from '../../storage/storage.interface.js';
import { ProfileService } from '../../profile/profile.service.js';
import { CvPdfSource, type CvPdfInput } from '../cv-pdf.source.js';
import { parseEvidenceList, type Evidence } from '../utils/evidence.js';
import type { ProfileProposal } from '../profile-proposal.schema.js';
import {
  pickProposalFields,
  safeFilename,
} from '../utils/profile-draft.utils.js';

@Injectable()
export class ProfileDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly cvPdf: CvPdfSource,
    private readonly profiles: ProfileService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /** Nhận một CV PDF: rút bằng chứng, lưu file gốc, tạo bản nháp, xếp vào hàng đợi. */
  async createFromCv(
    userId: string,
    input: CvPdfInput,
    stream = false,
  ): Promise<{ draftId: string; evidence: Evidence[] }> {
    const evidence = await this.cvPdf.collect(input);

    const key = userKey(userId, 'cv-uploads', safeFilename(input.filename));
    await this.storage.write(key, input.data);

    const draft = await this.prisma.profileDraft.create({
      data: {
        userId,
        status: 'PENDING',
        evidence: evidence as unknown as Prisma.InputJsonValue,
        storageKey: key,
        filename: input.filename,
      },
    });

    if (!stream) {
      await this.queue.send<ProfileSynthesizePayload>(
        QUEUE.PROFILE_SYNTHESIZE,
        {
          userId,
          draftId: draft.id,
        },
      );
    }

    return { draftId: draft.id, evidence };
  }

  /** File PDF gốc của một bản nháp, đọc từ Storage. */
  async file(
    userId: string,
    draftId: string,
  ): Promise<{ data: Buffer; filename: string }> {
    const draft = await this.get(userId, draftId);
    if (!draft.storageKey) {
      throw new NotFoundException('Bản nháp này không giữ file gốc.');
    }
    return {
      data: await this.storage.read(draft.storageKey),
      filename: draft.filename ?? 'cv.pdf',
    };
  }

  /** Bản nháp mới nhất, kể cả đang chạy hoặc đã hỏng. */
  async latest(userId: string): Promise<ProfileDraft> {
    const draft = await this.prisma.profileDraft.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) throw new NotFoundException('Chưa có lượt đọc CV nào');
    return draft;
  }

  async get(userId: string, id: string): Promise<ProfileDraft> {
    const draft = await this.prisma.profileDraft.findFirst({
      where: { id, userId },
    });
    if (!draft) throw new NotFoundException(`Không tìm thấy bản nháp: ${id}`);
    return draft;
  }

  /** Người dùng rời trang giữa lượt stream: xếp lại vào hàng đợi để lượt đọc không mất trắng. */
  async requeue(userId: string, draftId: string): Promise<void> {
    const draft = await this.prisma.profileDraft.findFirst({
      where: { id: draftId, userId },
    });
    if (!draft || draft.status === 'DONE') return;

    await this.prisma.profileDraft.update({
      where: { id: draftId },
      data: { status: 'PENDING', error: null },
    });
    await this.queue.send<ProfileSynthesizePayload>(QUEUE.PROFILE_SYNTHESIZE, {
      userId,
      draftId,
    });
  }

  /** Người dùng bấm chạy lại bản FAILED, dùng bằng chứng ĐÃ LƯU nên không phải nộp lại file. */
  async retry(userId: string, draftId: string): Promise<ProfileDraft> {
    const draft = await this.get(userId, draftId);

    if (draft.status !== 'FAILED') {
      throw new BadRequestException(
        `Bản nháp đang ở trạng thái ${draft.status}, chỉ chạy lại được bản đã FAILED.`,
      );
    }

    if (parseEvidenceList(draft.evidence).length === 0) {
      throw new BadRequestException(
        'Bản nháp không có bằng chứng nào đọc được, chạy lại cũng hỏng như cũ. Hãy nộp lại file.',
      );
    }

    const reset = await this.prisma.profileDraft.update({
      where: { id: draftId },
      data: { status: 'PENDING', error: null },
    });

    await this.queue.send<ProfileSynthesizePayload>(QUEUE.PROFILE_SYNTHESIZE, {
      userId,
      draftId,
    });

    return reset;
  }

  async history(userId: string, query: PaginationQueryDto) {
    const where = { userId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.profileDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
        select: {
          id: true,
          status: true,
          filename: true,
          createdAt: true,
          generatedAt: true,
          appliedAt: true,
          error: true,
        },
      }),
      this.prisma.profileDraft.count({ where }),
    ]);

    return pageOf(items, total, query);
  }

  /** Áp dụng một phần đề xuất vào hồ sơ thật. */
  async apply(
    userId: string,
    draftId: string,
    fields: string[],
  ): Promise<ProfileDraft> {
    const draft = await this.get(userId, draftId);

    if (draft.status !== 'DONE') {
      throw new BadRequestException(
        `Bản nháp đang ở trạng thái ${draft.status}, chưa có đề xuất để áp dụng.`,
      );
    }
    if (!draft.proposal) {
      throw new BadRequestException('Bản nháp không có đề xuất nào.');
    }

    const proposal = draft.proposal as unknown as ProfileProposal;
    const data = pickProposalFields(proposal, fields);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Chưa chọn trường nào để áp dụng vào hồ sơ.',
      );
    }

    await this.profiles.save(userId, data);

    return this.prisma.profileDraft.update({
      where: { id: draftId },
      data: { appliedAt: new Date() },
    });
  }
}
