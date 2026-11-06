import { Injectable } from '@nestjs/common';
import { withFailureKind } from '@/common/ai/failure-view';
import { CompanyService } from '@/modules/companies/services/company.service';
import { MatchingService } from '@/modules/matching/ai/services/matching.service';
import { ExtInsightsService } from '../insights/ext-insights.service';
import { ExtJobsService } from '../jobs/ext-jobs.service';
import { ExtUpskillService } from '../upskill/ext-upskill.service';
import type { ExtLookupDto } from './ext-lookup.dto';

@Injectable()
export class ExtLookupService {
  constructor(
    private readonly extJobs: ExtJobsService,
    private readonly matching: MatchingService,
    private readonly upskill: ExtUpskillService,
    private readonly companies: CompanyService,
    private readonly insights: ExtInsightsService,
  ) {}

  /** Đường ĐỌC auto-hiện: trả kết quả ĐÃ CÓ của một tin (điểm match đã chấm, kỹ năng thiếu nếu đã rút yêu cầu) + bản tóm tắt công ty đã cache. Không tạo tin, KHÔNG gọi model. */
  async lookup(userId: string, dto: ExtLookupDto) {
    const jobId = await this.extJobs.findJobIdByUrl(dto.url);
    const [match, gaps] = jobId
      ? await Promise.all([
          this.matching.findMatch(userId, jobId),
          this.upskill.gapsForJob(userId, jobId),
        ])
      : [null, null];
    const company = dto.company?.trim()
      ? await this.companies.forCompany(dto.company.trim())
      : null;
    const view = match ? withFailureKind(match) : null;
    const enriched =
      view?.status === 'DONE' && jobId
        ? { ...view, ...(await this.insights.forJob(userId, jobId)) }
        : view;
    return { match: enriched, gaps, company };
  }
}
