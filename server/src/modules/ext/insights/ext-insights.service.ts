import { Injectable } from '@nestjs/common';
import { JobsService } from '@/modules/jobs/jobs.service';

@Injectable()
export class ExtInsightsService {
  constructor(private readonly jobs: JobsService) {}

  /** Lương + tín hiệu đăng lại của một tin — tái dùng ĐÚNG logic trang chi tiết web (`JobsService.get`) để extension khớp web. Dùng chung cho luồng soi (poll) và auto-hiện (lookup). */
  async forJob(userId: string, jobId: string) {
    const detail = await this.jobs.get(jobId, userId);
    return { market: detail.salaryGuide, reposts: detail.reposts };
  }
}
