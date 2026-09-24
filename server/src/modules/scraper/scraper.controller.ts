import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { JobSourceRouter } from './services/job-source.router.js';
import { ScraperService } from './services/scraper.service.js';
import { ThrottleScrape } from '../../common/throttle.js';
import { StartScrapeDto } from './scraper.dto.js';
import { withFailureKind, withFailureKinds } from '../ai/utils/failure-view.js';

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

  /** Nhận portal mới mà không khởi động lại máy chủ — dùng sau khi thêm thư mục portal hoặc đổi cờ `enabled:`. */
  @ApiOperation({
    summary: 'Tải lại danh sách cổng thông tin cấu hình từ đĩa (Admin)',
  })
  @Post('portals/reload')
  @Roles('ADMIN')
  async reloadPortals() {
    const portals = await this.portals.reload();
    return { portals };
  }

  @ApiOperation({
    summary: 'Lấy lịch sử các lượt chạy scraper của người dùng hiện tại',
  })
  @Get('runs')
  async history(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    const page = await this.scraper.history(user.id, query);
    return { ...page, items: withFailureKinds(page.items) };
  }

  @ApiOperation({ summary: 'Lấy chi tiết một lượt chạy scraper theo ID' })
  @ApiParam({ name: 'id', description: 'ID của lượt chạy scraper' })
  @Get('runs/:id')
  // Lỗi thô của lượt quét chứa lệnh CLI và đường dẫn trên máy chủ; người dùng chỉ cần biết loại lỗi.
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return withFailureKind(await this.scraper.get(user.id, id));
  }

  /** Đường GHI: tạo bản ghi PENDING rồi xếp hàng đợi — một lượt quét mất vài phút vì phải giữ nhịp với portal. */
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
