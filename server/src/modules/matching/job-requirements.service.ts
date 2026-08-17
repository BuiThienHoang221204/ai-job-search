import { createHash } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Job, JobRequirement } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import {
  jobRequirementsSchema,
  type JobRequirements,
} from './job-requirements.schema.js';
import type { MatchProfile } from './requirement-match.js';

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
  '- Thà ghi 4 kỹ năng đúng còn hơn 14 mục trong đó 10 mục không khớp được với ai.',
  '- Quốc tịch và giấy phép lao động: chỉ điền khi tin nói rõ. Tin im lặng thì để null và false - đoán sai ở đây loại oan ứng viên đủ điều kiện.',
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

    await this.prisma.jobRequirement.upsert({
      where: { jobId },
      create: { jobId, status: 'RUNNING' },
      update: { status: 'RUNNING', error: null },
    });

    try {
      const { object, modelId } = await this.ai.generateObject<JobRequirements>(
        {
          schema: jobRequirementsSchema,
          context: { purpose: 'job.requirements' },
          system: SYSTEM,
          prompt: this.prompt(job),
        },
      );

      return await this.prisma.jobRequirement.update({
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Rút trích yêu cầu thất bại (${jobId}): ${message}`);
      return this.prisma.jobRequirement.update({
        where: { jobId },
        data: { status: 'FAILED', error: message },
      });
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

  /** Hồ sơ rút về đúng những trường Pha B cần. */
  static toMatchProfile(profile: {
    primarySkills: string[];
    secondarySkills: string[];
    citizenship: string | null;
    workPermit: string | null;
    location: string | null;
    willingToRelocate: boolean;
  }): MatchProfile {
    return {
      skills: [...profile.primarySkills, ...profile.secondarySkills],
      citizenship: profile.citizenship,
      workPermit: profile.workPermit,
      location: profile.location,
      willingToRelocate: profile.willingToRelocate,
      years: null,
    };
  }
}
