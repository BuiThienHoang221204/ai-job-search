import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { JobSourceRouter } from './sources/job-source.router.js';
import { ScraperService } from './scraper.service.js';
import { ThrottleScrape } from '../../common/throttle.js';

/**
 * Cố ý KHÔNG dùng @IsIn với danh sách cứng: danh sách portal được quét lúc
 * khởi động nên decorator (chạy lúc nạp class) không thể biết trước. Kiểm tra
 * ở thân hàm, nơi đọc được registry thật.
 */
export class StartScrapeDto {
  @IsOptional() @IsString() portal?: string;
}

@ApiTags('Scraper')
@ApiBearerAuth()
@Controller('scrape')
export class ScraperController {
  constructor(
    private readonly scraper: ScraperService,
    private readonly portals: JobSourceRouter,
    private readonly queue: QueueService,
  ) {}

  /** Danh sách portal đã đăng ký. Giao diện dùng để dựng menu chọn. */
  @ApiOperation({
    summary:
      'Lấy danh sách các cổng thông tin (portals) cào dữ liệu đã đăng ký',
  })
  @Get('portals')
  listPortals() {
    return { portals: this.portals.describePortals() };
  }

  /**
   * Quét lại thư mục portal mà không phải khởi động lại máy chủ. Dùng sau khi
   * thêm một thư mục portal mới hoặc đổi cờ `enabled:` trong SKILL.md.
   */
  @ApiOperation({
    summary: 'Tải lại danh sách cổng thông tin cấu hình từ đĩa (Admin)',
  })
  @Post('portals/reload')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async reloadPortals() {
    const portals = await this.portals.reload();
    return { portals };
  }

  @ApiOperation({
    summary: 'Lấy lịch sử các lượt chạy scraper của người dùng hiện tại',
  })
  @Get('runs')
  history(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.scraper.history(user.id, query);
  }

  @ApiOperation({ summary: 'Lấy chi tiết một lượt chạy scraper theo ID' })
  @ApiParam({ name: 'id', description: 'ID của lượt chạy scraper' })
  @Get('runs/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scraper.get(user.id, id);
  }

  /**
   * Đường GHI. Tạo bản ghi PENDING rồi đẩy vào hàng đợi; một lần quét mất
   * vài phút vì phải tôn trọng nhịp request tới portal.
   */
  @ThrottleScrape()
  @ApiOperation({
    summary: 'Bắt đầu một lượt quét tin tuyển dụng mới từ cổng thông tin',
  })
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
