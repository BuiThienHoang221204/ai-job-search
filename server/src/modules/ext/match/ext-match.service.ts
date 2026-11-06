import { Injectable } from '@nestjs/common';
import { withFailureKind } from '@/common/ai/failure-view';
import { MatchingService } from '@/modules/matching/ai/services/matching.service';
import { ExtInsightsService } from '../insights/ext-insights.service';
import type { ExtSaveJobDto } from '../jobs/ext-jobs.dto';
import { ExtJobsService } from '../jobs/ext-jobs.service';

@Injectable()
export class ExtMatchService {
  constructor(
    private readonly extJobs: ExtJobsService,
    private readonly matching: MatchingService,
    private readonly insights: ExtInsightsService,
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
    return { ...match, ...(await this.insights.forJob(userId, jobId)) };
  }
}
