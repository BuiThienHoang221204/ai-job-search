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
import { completionPercent } from '../../profile/completion.js';
import { profileOccupation } from '../../profile/occupation.js';
import { CvPdfSource, type CvPdfInput } from '../cv-pdf.source.js';
import { parseEvidenceList, type Evidence } from '../evidence.js';
import type { ProfileProposal } from '../profile-proposal.schema.js';

@Injectable()
export class ProfileDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly cvPdf: CvPdfSource,
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

  /**
   * Chạy lại lượt đọc CV từ bằng chứng ĐÃ LƯU, không bắt nộp lại file.
   *
   * Có mặt vì trên tier free, hỏng là chuyện thường: bản nháp FAILED mà không
   * có đường này thì cách duy nhất là tải lên lại, kéo theo parse lại PDF, ghi
   * trùng file vào storage, đẻ thêm một bản nháp rác, và vẫn tốn đúng một lượt
   * gọi model như nhau.
   *
   * Chỉ nhận FAILED, và phải do người dùng bấm: tự xếp lại khi chưa có bộ đếm
   * số lần thử sẽ thành vòng lặp đốt hạn mức.
   */
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

    const saved = await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    // Phải tính lại completion và ngành Ở ĐÂY, giống ProfileService.update.
    // Thiếu completion thì hồ sơ dựng hoàn toàn từ CV giữ nguyên mặc định 0, nằm
    // dưới MIN_COMPLETION_TO_SCORE và không bao giờ được chấm điểm. Thiếu ngành
    // thì hồ sơ đó không thuộc cụm nào, nên lượt quét đêm không sinh từ khoá cho
    // nghề của họ - cả hai đều là màn hình trống, không kèm lỗi nào.
    await this.prisma.profile.update({
      where: { userId },
      data: {
        completion: completionPercent(saved),
        occupationCode: profileOccupation(saved),
      },
    });

    await this.queue.send(QUEUE.SKILL_CANONICALIZE, { userId });

    return this.prisma.profileDraft.update({
      where: { id: draftId },
      data: { appliedAt: new Date() },
    });
  }
}

/** Những trường của đề xuất được phép ghi vào `Profile`. */
const APPLICABLE_FIELDS = [
  'headline',
  'location',
  'country',
  'summary',
  'languages',
  'primarySkills',
  'secondarySkills',
  'directExperienceDomains',
  'adjacentExperience',
  'experiences',
  'educations',
  'certificates',
  'projects',
] as const;

export type ApplicableField = (typeof APPLICABLE_FIELDS)[number];

export const isApplicableField = (value: string): value is ApplicableField =>
  (APPLICABLE_FIELDS as readonly string[]).includes(value);

/** Lọc ra đúng những trường vừa được chọn vừa có giá trị trong đề xuất. */
export function pickProposalFields(
  proposal: ProfileProposal,
  fields: string[],
): Record<string, unknown> {
  const chosen = new Set(fields.filter(isApplicableField));
  const data: Record<string, unknown> = {};

  for (const field of APPLICABLE_FIELDS) {
    if (!chosen.has(field)) continue;
    const value = proposal[field];
    if (value === undefined || value === null) continue;
    data[field] = value;
  }

  return data;
}

/** Làm sạch tên file trước khi ghép vào đường dẫn lưu trữ. */
export function safeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'cv.pdf';
  const cleaned = base
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'cv.pdf';
}
