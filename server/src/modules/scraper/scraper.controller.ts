import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { Roles } from '@/common/decorators/roles.decorator';
import { QUEUE, QueueService } from '../queue/queue.service';
import { JobSourceRouter } from './services/job-source.router';
import { ScraperService } from './services/scraper.service';
import { ThrottleScrape } from '@/common/throttle';
import { StartScrapeDto } from './scraper.dto';

@ApiTags('Scraper')
@ApiBearerAuth()
@Controller('scrape')
export class ScraperController {
  constructor(
    private readonly scraper: ScraperService,
    private readonly portals: JobSourceRouter,
    private readonly queue: QueueService,
  ) {}

  @ApiOperation({
    summary: 'Tải lại danh sách cổng thông tin cấu hình từ đĩa (Admin)',
  })
  @Post('portals/reload')
  @Roles('ADMIN')
  async reloadPortals() {
    const portals = await this.portals.reload();
    return { portals };
  }

  @ThrottleScrape()
  @ApiOperation({
    summary:
      'Bắt đầu một lượt quét tin tuyển dụng mới từ cổng thông tin (Admin)',
  })
  @Post()
  @Roles('ADMIN')
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
