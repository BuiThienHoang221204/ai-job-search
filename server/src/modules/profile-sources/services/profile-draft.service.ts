import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  QUEUE,
  QueueService,
  type ProfileSynthesizePayload,
} from '@/modules/queue/queue.service';
import {
  STORAGE,
  userKey,
  type Storage,
} from '@/modules/storage/storage.interface';
import { ProfileService } from '@/modules/profile/profile.service';
import { CvPdfSource, type CvPdfInput } from '../cv-pdf.source';
import { parseEvidenceList, type Evidence } from '../utils/evidence';
import type { ApplyDraftDto } from '../profile-draft.dto';
import {
  safeFilename,
  WITHOUT_EVIDENCE,
  type DraftView,
} from '../utils/profile-draft.utils';

@Injectable()
export class ProfileDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly cvPdf: CvPdfSource,
    private readonly profiles: ProfileService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

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
      await this.enqueue(userId, draft.id);
    }

    return { draftId: draft.id, evidence };
  }

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

  async latest(userId: string): Promise<DraftView> {
    const draft = await this.prisma.profileDraft.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      omit: WITHOUT_EVIDENCE,
    });
    if (!draft) throw new NotFoundException('Chưa có lượt đọc CV nào');
    return draft;
  }

  async get(userId: string, id: string): Promise<DraftView> {
    const draft = await this.prisma.profileDraft.findFirst({
      where: { id, userId },
      omit: WITHOUT_EVIDENCE,
    });
    if (!draft) throw new NotFoundException(`Không tìm thấy bản nháp: ${id}`);
    return draft;
  }

  async requeue(userId: string, draftId: string): Promise<void> {
    const draft = await this.prisma.profileDraft.findFirst({
      where: { id: draftId, userId },
    });
    if (!draft || draft.status === 'DONE') return;

    await this.prisma.profileDraft.update({
      where: { id: draftId },
      data: { status: 'PENDING', error: null },
    });
    await this.enqueue(userId, draftId);
  }

  private enqueue(userId: string, draftId: string) {
    return this.queue.send<ProfileSynthesizePayload>(QUEUE.PROFILE_SYNTHESIZE, {
      userId,
      draftId,
    });
  }

  async retry(userId: string, draftId: string): Promise<DraftView> {
    const draft = await this.prisma.profileDraft.findFirst({
      where: { id: draftId, userId },
    });
    if (!draft)
      throw new NotFoundException(`Không tìm thấy bản nháp: ${draftId}`);

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
      omit: WITHOUT_EVIDENCE,
    });

    await this.enqueue(userId, draftId);

    return reset;
  }

  async apply(
    userId: string,
    draftId: string,
    values: ApplyDraftDto,
  ): Promise<DraftView> {
    const draft = await this.get(userId, draftId);

    if (draft.status !== 'DONE') {
      throw new BadRequestException(
        `Bản nháp đang ở trạng thái ${draft.status}, chưa có đề xuất để áp dụng.`,
      );
    }
    const data = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Chưa chọn trường nào để áp dụng vào hồ sơ.',
      );
    }

    await this.profiles.save(userId, data);

    return this.prisma.profileDraft.update({
      where: { id: draftId },
      data: { appliedAt: new Date() },
      omit: WITHOUT_EVIDENCE,
    });
  }
}
