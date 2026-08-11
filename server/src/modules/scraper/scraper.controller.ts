import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthUser } from '../auth/jwt.strategy.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { PortalCliService } from './portal-cli.service.js';
import { ScraperService } from './scraper.service.js';

/// Cố ý KHÔNG dùng @IsIn với danh sách cứng: danh sách portal được quét lúc
/// khởi động nên decorator (chạy lúc nạp class) không thể biết trước. Kiểm tra
/// ở thân hàm, nơi đọc được registry thật.
export class StartScrapeDto {
  @IsOptional() @IsString() portal?: string;
}

@Controller('scrape')
@UseGuards(JwtAuthGuard)
export class ScraperController {
  constructor(
    private readonly scraper: ScraperService,
    private readonly portals: PortalCliService,
    private readonly queue: QueueService,
  ) {}

  /// Danh sách portal đã đăng ký. Giao diện dùng để dựng menu chọn.
  @Get('portals')
  listPortals() {
    return { portals: this.portals.describePortals() };
  }

  /// Quét lại thư mục portal mà không phải khởi động lại máy chủ. Dùng sau khi
  /// thêm một thư mục portal mới hoặc đổi cờ `enabled:` trong SKILL.md.
  @Post('portals/reload')
  async reloadPortals() {
    const portals = await this.portals.reload();
    return { portals };
  }

  @Get('runs')
  history(@CurrentUser() user: AuthUser) {
    return this.scraper.history(user.id);
  }

  @Get('runs/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scraper.get(user.id, id);
  }

  /// Đường GHI. Tạo bản ghi PENDING rồi đẩy vào hàng đợi; một lần quét mất
  /// vài phút vì phải tôn trọng nhịp request tới portal.
  @Post()
  async start(@CurrentUser() user: AuthUser, @Body() dto: StartScrapeDto) {
    const available = this.portals.listPortals();
    const portal = dto.portal ?? available[0];

    if (!portal) {
      throw new BadRequestException(
        'Chưa có portal nào được đăng ký. Kiểm tra thư mục .agents/skills/.',
      );
    }
    if (!this.portals.has(portal)) {
      throw new BadRequestException(
        `Portal chưa được hỗ trợ: ${portal}. Đang có: ${available.join(', ')}`,
      );
    }

    const run = await this.scraper.create(user.id, portal);
    await this.queue.send(QUEUE.SCRAPE_RUN, { userId: user.id, runId: run.id });
    return { queued: true, runId: run.id, portal: run.portal };
  }
}
