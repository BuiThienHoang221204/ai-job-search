import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { TaxonomyBackfillService } from '../jobs/taxonomy/backfill.service.js';
import { ReconcileService } from '../reconcile/services/reconcile.service.js';
import { ScrapeCronService } from '../scraper/scrape-cron.service.js';
import { AdminService } from './admin.service.js';

export class AiHealthQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

export class FailuresQueryDto extends PaginationQueryDto {}

/**
 * Chỉ khai RolesGuard ở đây. `JwtAuthGuard` là APP_GUARD toàn cục và guard
 * toàn cục luôn chạy TRƯỚC guard của controller, nên `request.user` chắc chắn
 * đã có khi RolesGuard đọc tới.
 */
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly cron: ScrapeCronService,
    private readonly reconcile: ReconcileService,
    private readonly backfill: TaxonomyBackfillService,
  ) {}

  /**
   * Tỷ lệ hỏng, độ trễ p50/p95 và phân loại nguyên nhân, tách theo tác vụ và
   * theo model. Đây là câu trả lời cho "gateway free có dùng được không".
   */
  @Get('ai-health')
  aiHealth(@Query() query: AiHealthQueryDto) {
    return this.admin.aiHealth(query.days ?? 7);
  }

  @Get('ai-failures')
  failures(@Query() query: FailuresQueryDto) {
    return this.admin.recentFailures(query);
  }

  /** Chạy NGAY lượt quét hằng đêm, không đợi tới 23:00. */
  @Post('scrape/run-now')
  @HttpCode(202)
  async scrapeNow() {
    const started = await this.cron.runAllPortals();
    return {
      queued: started.length,
      runs: started,
      note: started.length
        ? 'Đang quét ở nền. Theo dõi bằng GET /api/scrape/runs.'
        : 'Không có portal nào được đăng ký, hoặc lượt quét trước còn đang chạy.',
    };
  }

  /**
   * Tính lại mã tỉnh/thành, mã ngành và văn bản tìm kiếm cho tin đã có.
   *
   * `?all=true` tính lại TẤT CẢ - dùng sau khi sửa danh mục tỉnh hoặc ngành,
   * vì tin cũ vẫn giữ mã suy ra từ danh mục phiên bản trước.
   */
  @Post('jobs/backfill-taxonomy')
  @HttpCode(200)
  backfillTaxonomy(@Query('all') all?: string) {
    return this.backfill.run(all === 'true');
  }

  /** Nhặt NGAY những việc nền đã rơi, không đợi lượt cron 10 phút. */
  @Post('reconcile/run-now')
  @HttpCode(202)
  async reconcileNow() {
    const result = await this.reconcile.run();
    return {
      ...result,
      note:
        result.documents || result.matches
          ? 'Đã xếp lại vào hàng đợi. Worker sẽ xử lý ở nền.'
          : 'Không tìm thấy việc nào bị rơi.',
    };
  }
}
