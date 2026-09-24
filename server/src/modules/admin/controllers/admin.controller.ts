import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Put,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { pageFromArray, type Page } from '../../../common/pagination.js';
import { QueueConfigService } from '../../queue/queue-config.service.js';
import type { QueueConfigItem } from '../../queue/queue.types.js';
import { TaxonomyBackfillService } from '../../jobs/taxonomy/backfill.service.js';
import { ReconcileService } from '../../reconcile/services/reconcile.service.js';
import { ScrapeCronService } from '../../scraper/services/scrape-cron.service.js';
import {
  AiHealthQueryDto,
  AiUsageQueryDto,
  FailureFacetsQueryDto,
  FailuresQueryDto,
  OverviewQueryDto,
  QueueConfigQueryDto,
  ScrapeRunsQueryDto,
  UpdateQueueConfigDto,
} from '../admin.dto.js';
import { AdminService } from '../services/admin.service.js';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly cron: ScrapeCronService,
    private readonly reconcile: ReconcileService,
    private readonly backfill: TaxonomyBackfillService,
    private readonly queueConfig: QueueConfigService,
  ) {}

  /**
   * Tỷ lệ hỏng, độ trễ p50/p95 và phân loại nguyên nhân, tách theo tác vụ và
   * theo model. Đây là câu trả lời cho "gateway free có dùng được không".
   */
  @ApiOperation({ summary: 'Xem thống kê sức khỏe và hiệu năng tích hợp AI' })
  @Get('ai-health')
  aiHealth(@Query() query: AiHealthQueryDto) {
    return this.admin.aiHealth(query.days ?? 7);
  }

  @ApiOperation({
    summary:
      'Tổng quan vận hành: chỉ số so kỳ trước, lỗi gom nhóm, mục cần xử lý',
  })
  @Get('overview')
  overview(@Query() query: OverviewQueryDto) {
    return this.admin.overview(query.days ?? 1);
  }

  @ApiOperation({ summary: 'Xem danh sách các lỗi AI gần đây' })
  @Get('ai-failures')
  failures(@Query() query: FailuresQueryDto) {
    return this.admin.recentFailures(query);
  }

  /** Không phải danh sách phân trang: số tác vụ/model hỏng chỉ vài chục, dùng để dựng ô chọn của bộ lọc. */
  @ApiOperation({
    summary: 'Các tác vụ và model có lời gọi hỏng trong khoảng, kèm số lần',
  })
  @Get('ai-failures/facets')
  failureFacets(@Query() query: FailureFacetsQueryDto) {
    return this.admin.failureFacets(query);
  }

  @ApiOperation({
    summary: 'Xem toàn bộ một lời gọi AI, kể cả phản hồi thô của model',
  })
  @ApiParam({ name: 'id', description: 'ID của bản ghi AiCall' })
  @Get('ai-calls/:id')
  aiCall(@Param('id') id: string) {
    return this.admin.aiCall(id);
  }

  @ApiOperation({
    summary: 'Tổng token AI theo ngày, model, tác vụ và người dùng',
  })
  @Get('ai-usage')
  aiUsage(@Query() query: AiUsageQueryDto) {
    return this.admin.aiUsage(query.days ?? 7);
  }

  /** Mọi lượt quét của mọi tài khoản; `/scrape/runs` chỉ trả lượt hệ thống và của chính người gọi. */
  @ApiOperation({ summary: 'Lịch sử quét của toàn hệ thống' })
  @Get('scrape/runs')
  scrapeRuns(@Query() query: ScrapeRunsQueryDto) {
    return this.admin.scrapeRuns(query);
  }

  /** Chạy NGAY lượt quét hằng đêm, không đợi tới 23:00. */
  @ApiOperation({
    summary: 'Chạy ngay lập tức tiến trình cào dữ liệu từ các cổng',
  })
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
  @ApiOperation({
    summary: 'Backfill taxonomy - cập nhật lại phân loại tỉnh thành/ngành nghề',
  })
  @ApiQuery({
    name: 'all',
    type: String,
    required: false,
    description: 'Có backfill lại toàn bộ hay không ("true"/"false")',
  })
  @Post('jobs/backfill-taxonomy')
  @HttpCode(200)
  backfillTaxonomy(@Query('all') all?: string) {
    return this.backfill.run(all === 'true');
  }

  /** Nhặt NGAY những việc nền đã rơi, không đợi lượt cron 10 phút. */
  @ApiOperation({
    summary: 'Xử lý ngay lập tức các công việc nền bị lỗi hoặc chưa hoàn thành',
  })
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

  // ── Queue Config ──────────────────────────────────────────────

  @ApiOperation({
    summary: 'Lấy danh sách cấu hình concurrency của tất cả hàng đợi',
  })
  @Get('queue/config')
  async queueConfigList(
    @Query() query: QueueConfigQueryDto,
  ): Promise<Page<QueueConfigItem>> {
    return pageFromArray(await this.queueConfig.findAll(), query);
  }

  @ApiOperation({
    summary: 'Cập nhật concurrency cho một hàng đợi',
  })
  @ApiParam({ name: 'queueName', example: 'match.evaluate' })
  @Put('queue/config/:queueName')
  queueConfigUpdate(
    @Param('queueName') queueName: string,
    @Body() body: UpdateQueueConfigDto,
  ): Promise<QueueConfigItem> {
    return this.queueConfig.update(queueName, body);
  }
}
