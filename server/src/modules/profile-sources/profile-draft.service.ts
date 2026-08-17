import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, ProfileDraft } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  QUEUE,
  QueueService,
  type ProfileSynthesizePayload,
} from '../queue/queue.service.js';
import {
  STORAGE,
  userKey,
  type Storage,
} from '../storage/storage.interface.js';
import { completionPercent } from '../profile/completion.js';
import { CvPdfSource, type CvPdfInput } from './cv-pdf.source.js';
import type { Evidence } from './evidence.js';
import type { ProfileProposal } from './profile-proposal.schema.js';

/** Số bản nháp trả về ở danh sách. */
const HISTORY_LIMIT = 10;

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

    await this.queue.send<ProfileSynthesizePayload>(QUEUE.PROFILE_SYNTHESIZE, {
      userId,
      draftId: draft.id,
    });

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

  history(userId: string) {
    return this.prisma.profileDraft.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        status: true,
        filename: true,
        createdAt: true,
        generatedAt: true,
        appliedAt: true,
        error: true,
      },
    });
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

    // Phải tính lại completion Ở ĐÂY, giống ProfileService.update. Thiếu bước này
    // thì hồ sơ dựng hoàn toàn từ CV giữ nguyên mặc định 0, nằm dưới
    // MIN_COMPLETION_TO_SCORE, và người dùng đó không bao giờ được fan-out chấm
    // điểm - một màn hình trống vĩnh viễn, không kèm lỗi nào.
    await this.prisma.profile.update({
      where: { userId },
      data: { completion: completionPercent(saved) },
    });

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
