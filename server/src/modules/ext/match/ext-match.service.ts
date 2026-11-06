import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { withFailureKind } from '@/common/ai/failure-view';
import { MatchingService } from '@/modules/matching/ai/services/matching.service';
import { repostSignal } from '@/modules/jobs/utils/repost';
import { SalaryService } from '@/modules/salary/salary.service';
import type { ExtSaveJobDto } from '../jobs/ext-jobs.dto';
import { ExtJobsService } from '../jobs/ext-jobs.service';

@Injectable()
export class ExtMatchService {
  constructor(
    private readonly extJobs: ExtJobsService,
    private readonly matching: MatchingService,
    private readonly salary: SalaryService,
    private readonly prisma: PrismaService,
  ) {}

  /** Lưu tin về tài khoản (tạo/tái dùng Job + SavedJob) rồi xếp hàng chấm điểm AI cho chính người gọi — luôn là tin của chủ nên không rò sang người khác. `force` chấm lại khi hồ sơ đã đổi (điểm cũ lỗi thời). */
  async quick(userId: string, dto: ExtSaveJobDto, force = false) {
    const { jobId } = await this.extJobs.save(userId, dto);
    const result = await this.matching.enqueue(userId, jobId, force);
    return { jobId, ...result };
  }

  async result(userId: string, jobId: string) {
    const match = withFailureKind(await this.matching.getMatch(userId, jobId));
    if (match.status !== 'DONE') return match;
    return { ...match, ...(await this.extras(jobId)) };
  }

  /** Thông tin thị trường kèm kết quả soi (chỉ khi DONE): lương tham chiếu + tín hiệu đăng lại nhiều lần. */
  private async extras(jobId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: {
        title: true,
        occupationCode: true,
        subOccupationCode: true,
        salaryMin: true,
        salaryMax: true,
        dedupeKey: true,
        requirements: {
          select: {
            status: true,
            requiredSkills: true,
            minYears: true,
            seniority: true,
          },
        },
      },
    });
    if (!job) return { market: null, reposts: null };

    const guide = await this.salary.guideForJob(
      job,
      job.requirements?.status === 'DONE' ? job.requirements : null,
      null,
    );

    return {
      market: guide
        ? {
            floor: guide.floor,
            target: guide.target,
            ceiling: guide.ceiling,
            currency: guide.currency,
            label: guide.label,
          }
        : null,
      reposts: await this.reposts(job.dedupeKey),
    };
  }

  private async reposts(dedupeKey: string | null) {
    if (!dedupeKey) return null;
    const postings = await this.prisma.job.findMany({
      where: { dedupeKey, duplicateOfId: null },
      select: { postedAt: true, scrapedAt: true },
    });
    return repostSignal(
      postings
        .map((posting) => posting.postedAt ?? posting.scrapedAt)
        .filter((date): date is Date => date != null),
    );
  }
}
