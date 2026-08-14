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
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { ReconcileService } from '../reconcile/reconcile.service.js';
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

export class FailuresQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/// Chỉ khai RolesGuard ở đây. `JwtAuthGuard` là APP_GUARD toàn cục và guard
/// toàn cục luôn chạy TRƯỚC guard của controller, nên `request.user` chắc chắn
/// đã có khi RolesGuard đọc tới.
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly cron: ScrapeCronService,
    private readonly reconcile: ReconcileService,
  ) {}

  /// Tỷ lệ hỏng, độ trễ p50/p95 và phân loại nguyên nhân, tách theo tác vụ và
  /// theo model. Đây là câu trả lời cho "gateway free có dùng được không".
  @Get('ai-health')
  aiHealth(@Query() query: AiHealthQueryDto) {
    return this.admin.aiHealth(query.days ?? 7);
  }

  @Get('ai-failures')
  failures(@Query() query: FailuresQueryDto) {
    return this.admin.recentFailures(query.limit ?? 20);
  }

  /// Chạy NGAY lượt quét hằng đêm, không đợi tới 23:00.
  ///
  /// Gọi đúng hàm mà cron gọi (`runAllPortals`), nên đây là phép thử thật của
  /// đường tự động chứ không phải một đường song song dựng riêng để test - một
  /// đường riêng thì có thể xanh trong khi cron vẫn hỏng.
  ///
  /// Trả về ngay danh sách lượt quét đã xếp hàng; công việc chạy nền ở worker,
  /// theo dõi tiến độ bằng `GET /api/scrape/runs`.
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

  /// Nhặt NGAY những việc nền đã rơi, không đợi lượt cron 10 phút.
  ///
  /// Gọi đúng hàm mà cron gọi, cùng lý do như route quét ở trên: một đường riêng
  /// dựng để bấm tay có thể xanh trong khi đường tự động vẫn hỏng.
  ///
  /// An toàn khi bấm nhiều lần: hàng đợi chặn trùng theo khoá, nên việc đã xếp
  /// không bị xếp lại lần nữa.
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
