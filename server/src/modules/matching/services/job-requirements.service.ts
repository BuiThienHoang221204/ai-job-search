import { createHash } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Job, JobRequirement } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AiService } from '../../ai/services/ai.service.js';
import {
  jobRequirementsBatchSchema,
  jobRequirementsSchema,
  type JobRequirements,
  type JobRequirementsBatch,
} from '../schemas/job-requirements.schema.js';
import type { MatchProfile } from '../requirement-match.js';
import { yearsOfExperience } from '../../profile/experience-years.js';

const SYSTEM = [
  'Bạn rút trích YÊU CẦU từ một tin tuyển dụng. Không đánh giá ứng viên nào - tin này sẽ được đối chiếu với nhiều hồ sơ khác nhau.',
  '',
  'Quy tắc bắt buộc:',
  '- Chỉ ghi những gì tin VIẾT RA. Không suy diễn, không thêm kỹ năng "thường đi kèm".',
  '- Phân biệt BẮT BUỘC với ƯU TIÊN: "yêu cầu", "must have" là bắt buộc; "là một lợi thế", "ưu tiên", "nice to have" là ưu tiên.',
  '',
  'PHÉP THỬ cho mỗi kỹ năng trước khi ghi: "một ứng viên có khai mục này trong phần Kỹ năng của CV không?"',
  '- ĐƯỢC: Kubernetes, Terraform, Python, kế toán thuế, fintech, Incident Management.',
  '- KHÔNG ĐƯỢC: "SLO bốn số chín", "vận hành xuất sắc", "ưu tiên theo dữ liệu", "quản lý đội ngũ", "thực thi dự án phức tạp".',
  '  Đó là kết quả, phẩm chất hoặc trách nhiệm - không ai khai chúng thành kỹ năng, nên ghi vào chỉ làm mọi hồ sơ trượt oan.',
  "- KHÔNG ghi bằng cấp, học vị hay chứng chỉ: Bachelor's degree, Cử nhân, IELTS không phải kỹ năng.",
  '- Mỗi kỹ năng tối đa 5 từ. Ưu tiên tên riêng (React, AWS) hơn diễn đạt dài.',
  '- Thà ghi 4 kỹ năng đúng còn hơn 14 mục trong đó 10 mục không khớp được với ai.',
  '- Quốc tịch và giấy phép lao động: chỉ điền khi tin nói rõ. Tin im lặng thì để null và false - đoán sai ở đây loại oan ứng viên đủ điều kiện.',
].join('\n');

/**
 * Tin dài hơn mức này đi đường lẻ thay vì vào lô. Đo trên 563 tin trong kho:
 * p50 2.556 ký tự, p95 5.993 - nên mức này giữ khoảng 95% số tin ở đường gộp.
 */
const BATCH_MAX_DESCRIPTION = 6_000;

const BATCH_SYSTEM = [
  SYSTEM,
  '',
  'ĐẦU VÀO LÀ NHIỀU TIN, mỗi tin mở đầu bằng "=== TIN [số] ===".',
  '- Trả về MỘT phần tử cho MỖI tin, và `index` phải đúng bằng số trong ngoặc vuông của tin đó.',
  '- Xử lý từng tin ĐỘC LẬP. Tuyệt đối không mang kỹ năng của tin này sang tin khác, kể cả khi hai tin giống nhau.',
  '- Tin nào không đọc được thì vẫn trả phần tử của nó với danh sách kỹ năng rỗng, đừng bỏ qua.',
].join('\n');

@Injectable()
export class JobRequirementsService {
  private readonly logger = new Logger(JobRequirementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /** Phần của tin thật sự đi vào prompt. Đổi thì phải rút lại. */
  private sourceHash(job: Job): string {
    return createHash('sha256')
      .update(job.title)
      .update(job.description)
      .update(job.location ?? '')
      .update(job.workMode ?? '')
      .digest('hex')
      .slice(0, 32);
  }

  private prompt(job: Job): string {
    return [
      `Chức danh: ${job.title}`,
      `Công ty: ${job.company}`,
      `Địa điểm: ${job.location ?? 'không rõ'}`,
      `Hình thức: ${job.workMode ?? 'không rõ'}`,
      '',
      'Mô tả:',
      job.description,
    ].join('\n');
  }

  private async markRunning(jobId: string): Promise<void> {
    await this.prisma.jobRequirement.upsert({
      where: { jobId },
      create: { jobId, status: 'RUNNING' },
      update: { status: 'RUNNING', error: null },
    });
  }

  private persist(
    jobId: string,
    hash: string,
    object: JobRequirements,
    modelId: string,
  ): Promise<JobRequirement> {
    return this.prisma.jobRequirement.update({
      where: { jobId },
      data: {
        status: 'DONE',
        requiredSkills: object.requiredSkills,
        niceToHaveSkills: object.niceToHaveSkills,
        minYears: object.minYears,
        seniority: object.seniority,
        citizenshipRequired: object.citizenshipRequired,
        workPermitRequired: object.workPermitRequired,
        eligibilityQuote: object.eligibilityQuote || null,
        city: object.city,
        remotePolicy: object.remotePolicy,
        sourceHash: hash,
        modelId,
        extractedAt: new Date(),
        error: null,
      },
    });
  }

  private markFailed(jobId: string, error: unknown): Promise<JobRequirement> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Rút trích yêu cầu thất bại (${jobId}): ${message}`);
    return this.prisma.jobRequirement.update({
      where: { jobId },
      data: { status: 'FAILED', error: message },
    });
  }

  /** Rút trích yêu cầu của một tin. Bỏ qua nếu nội dung chưa đổi. */
  async extract(jobId: string, force = false): Promise<JobRequirement> {
    const [job, existing] = await Promise.all([
      this.prisma.job.findUnique({ where: { id: jobId } }),
      this.prisma.jobRequirement.findUnique({ where: { jobId } }),
    ]);
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

    const hash = this.sourceHash(job);
    if (!force && existing?.status === 'DONE' && existing.sourceHash === hash) {
      return existing;
    }

    await this.markRunning(jobId);

    try {
      const { object, modelId } = await this.ai.generateObject<JobRequirements>(
        {
          schema: jobRequirementsSchema,
          context: { purpose: 'job.requirements' },
          system: SYSTEM,
          prompt: this.prompt(job),
        },
      );

      return await this.persist(jobId, hash, object, modelId);
    } catch (error) {
      return this.markFailed(jobId, error);
    }
  }

  /**
   * Rút trích cho NHIỀU tin bằng một lượt gọi model.
   *
   * Tin dài hơn `BATCH_MAX_DESCRIPTION` đi đường lẻ: gộp chúng vào lô sẽ đẩy
   * prompt lên quá cỡ và kéo cả lô hỏng theo. Lô hỏng hoặc thiếu phần tử cũng
   * lùi về đường lẻ, nên gộp lô không bao giờ tệ hơn không gộp.
   */
  async extractMany(
    jobIds: string[],
    force = false,
  ): Promise<JobRequirement[]> {
    if (jobIds.length <= 1) {
      return jobIds.length ? [await this.extract(jobIds[0], force)] : [];
    }

    const [jobs, existing] = await Promise.all([
      this.prisma.job.findMany({ where: { id: { in: jobIds } } }),
      this.prisma.jobRequirement.findMany({
        where: { jobId: { in: jobIds } },
      }),
    ]);
    const byJobId = new Map(existing.map((row) => [row.jobId, row]));

    const results: JobRequirement[] = [];
    const batch: Array<{ job: Job; hash: string }> = [];

    for (const job of jobs) {
      const hash = this.sourceHash(job);
      const previous = byJobId.get(job.id);
      if (
        !force &&
        previous?.status === 'DONE' &&
        previous.sourceHash === hash
      ) {
        results.push(previous);
        continue;
      }
      if (job.description.length > BATCH_MAX_DESCRIPTION) {
        results.push(await this.extract(job.id, force));
        continue;
      }
      batch.push({ job, hash });
    }

    if (!batch.length) return results;
    if (batch.length === 1) {
      results.push(await this.extract(batch[0].job.id, force));
      return results;
    }

    for (const entry of batch) await this.markRunning(entry.job.id);

    try {
      const { object, modelId } =
        await this.ai.generateObject<JobRequirementsBatch>({
          schema: jobRequirementsBatchSchema,
          context: { purpose: 'job.requirements' },
          system: BATCH_SYSTEM,
          prompt: batch
            .map(
              (entry, offset) =>
                `=== TIN [${offset + 1}] ===\n${this.prompt(entry.job)}`,
            )
            .join('\n\n'),
        });

      const byIndex = new Map(object.jobs.map((row) => [row.index, row]));

      for (const [offset, entry] of batch.entries()) {
        const extracted = byIndex.get(offset + 1);
        if (!extracted) {
          this.logger.warn(
            `Lô thiếu phần tử [${offset + 1}] cho ${entry.job.id}; rút lẻ`,
          );
          results.push(await this.extract(entry.job.id, force));
          continue;
        }
        results.push(
          await this.persist(entry.job.id, entry.hash, extracted, modelId),
        );
      }
      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Lô ${batch.length} tin hỏng (${message}); rút lại từng tin một`,
      );
      for (const entry of batch) {
        results.push(await this.extract(entry.job.id, force));
      }
      return results;
    }
  }

  /** Đổi bản ghi database thành hình dạng mà `matchRequirements` nhận. */
  static toRequirements(row: JobRequirement): JobRequirements {
    return {
      requiredSkills: row.requiredSkills,
      niceToHaveSkills: row.niceToHaveSkills,
      minYears: row.minYears,
      seniority: row.seniority,
      citizenshipRequired: row.citizenshipRequired,
      workPermitRequired: row.workPermitRequired,
      eligibilityQuote: row.eligibilityQuote ?? '',
      city: row.city,
      remotePolicy: row.remotePolicy,
    };
  }

  /**
   * Hồ sơ rút về đúng những trường Pha B cần.
   *
   * `headline` đi vào cùng danh sách kỹ năng: tin đòi "kế toán" mà hồ sơ chỉ khai
   * Excel/Misa sẽ khớp 0, dù chức danh ghi rõ "Kế toán tổng hợp".
   */
  static toMatchProfile(profile: {
    headline?: string | null;
    primarySkills: string[];
    secondarySkills: string[];
    citizenship: string | null;
    workPermit: string | null;
    location: string | null;
    willingToRelocate: boolean;
    experiences?: unknown;
  }): MatchProfile {
    return {
      skills: [
        ...(profile.headline ? [profile.headline] : []),
        ...profile.primarySkills,
        ...profile.secondarySkills,
      ],
      citizenship: profile.citizenship,
      workPermit: profile.workPermit,
      location: profile.location,
      willingToRelocate: profile.willingToRelocate,
      years: yearsOfExperience(profile.experiences),
    };
  }
}
