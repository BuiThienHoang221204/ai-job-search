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
import { CvPdfSource, type CvPdfInput } from './cv-pdf.source.js';
import type { Evidence } from './evidence.js';
import type { ProfileProposal } from './profile-proposal.schema.js';

/// Số bản nháp trả về ở danh sách.
const HISTORY_LIMIT = 10;

@Injectable()
export class ProfileDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly cvPdf: CvPdfSource,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  /**
   * Nhận một CV PDF: rút bằng chứng, lưu file gốc, tạo bản nháp, xếp vào hàng đợi.
   *
   * Thứ tự có chủ đích. **Rút bằng chứng TRƯỚC khi tạo bản ghi** để một file hỏng
   * hay file scan bị từ chối ngay tại request, kèm lý do cụ thể — thay vì tạo ra
   * một bản nháp FAILED mà người dùng phải mở màn hình khác mới biết vì sao.
   *
   * Lưu file gốc sau khi đọc được: giữ lại một file không đọc nổi chỉ tốn đĩa.
   */
  async createFromCv(
    userId: string,
    input: CvPdfInput,
  ): Promise<{ draftId: string; evidence: Evidence[] }> {
    // Ném `ScannedPdfError` / `PdfExtractError`; controller dịch sang câu tiếng
    // Việt bằng `cvPdfErrorMessage`.
    const evidence = await this.cvPdf.collect(input);

    const key = userKey(userId, 'cv-uploads', safeFilename(input.filename));
    await this.storage.write(key, input.data);

    const draft = await this.prisma.profileDraft.create({
      data: {
        userId,
        status: 'PENDING',
        /*
         * `Evidence[]` không tự khớp `Prisma.InputJsonValue`: kiểu JSON của Prisma
         * đòi index signature mà một interface không có, dù mọi trường của nó đều
         * là JSON hợp lệ. Đây là chỗ Prisma tự khuyên dùng ép kiểu.
         *
         * Ép tới ĐÚNG kiểu Prisma cần, không ép sang `object[]` rồi để suy tiếp:
         * `eslint --fix` đã gỡ bản trước vì rule `no-unnecessary-type-assertion`
         * coi nó là vô ích, và build vỡ ngay sau đó.
         *
         * An toàn ở đây không dựa vào ép kiểu mà dựa vào `parseEvidenceList` lúc
         * ĐỌC ra: hàng dữ liệu nào sai hình dạng thì bị bỏ, không chảy vào prompt.
         */
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

  /// Bản nháp mới nhất, kể cả đang chạy hoặc đã hỏng.
  ///
  /// Khác `upskill.latest` (chỉ trả bản DONE) và đó là có chủ đích: màn Upload cần
  /// biết lượt đọc đang chạy để hiện tiến trình, chứ không phải chỉ biết kết quả.
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

  /**
   * Áp dụng một phần đề xuất vào hồ sơ thật.
   *
   * `fields` là danh sách tên trường người dùng ĐÃ TÍCH ở màn xác nhận. Cố ý không
   * có chế độ "áp dụng tất cả" ở tầng service: người dùng chọn từng trường, và
   * frontend gửi lên đúng những trường đó. Một tham số `applyAll` sẽ là đường ngắn
   * để bỏ qua bước xác nhận, tức là bỏ qua đúng thứ bảng `ProfileDraft` được dựng
   * ra để bảo vệ.
   *
   * Trường không nằm trong `fields` thì giữ nguyên giá trị đang có trong hồ sơ.
   */
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

    // `upsert` vì hồ sơ có thể chưa tồn tại: đường đăng ký tạo sẵn một Profile
    // rỗng, nhưng tài khoản tạo bằng SQL tay thì không.
    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return this.prisma.profileDraft.update({
      where: { id: draftId },
      data: { appliedAt: new Date() },
    });
  }
}

/**
 * Những trường của đề xuất được phép ghi vào `Profile`.
 *
 * Danh sách trắng, KHÔNG phải danh sách đen. `fields` đến từ HTTP request, nên nếu
 * đây là danh sách đen thì một trường mới thêm vào schema đề xuất sẽ tự động ghi
 * được — kể cả `citizenship` hay `workPermit`, đúng những thứ
 * `profile-proposal.schema.ts` cấm model đoán.
 *
 * `missing` và `notes` cố ý KHÔNG có trong đây: chúng là ghi chú của model về giới
 * hạn của chính nó, dành cho màn xác nhận, không phải dữ liệu hồ sơ.
 */
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

/**
 * Lọc ra đúng những trường vừa được chọn vừa có giá trị trong đề xuất.
 *
 * Bỏ qua `undefined` là quan trọng: người dùng tích "học vấn" trong khi model
 * không tìm thấy học vấn thì phải KHÔNG làm gì, chứ không được ghi `undefined` lên
 * dữ liệu người dùng đã gõ tay trước đó.
 */
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

/**
 * Làm sạch tên file trước khi ghép vào đường dẫn lưu trữ.
 *
 * `LocalStorage` đã chặn path traversal và có 13 test cho việc đó, nhưng dựa vào
 * lớp cuối để chặn một đầu vào của người dùng là dựa sai chỗ: nếu sau này đổi sang
 * S3, `..` không còn ý nghĩa nhưng một tên file có `/` vẫn tạo ra cây thư mục
 * ngoài ý muốn.
 */
export function safeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'cv.pdf';
  const cleaned = base
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'cv.pdf';
}
