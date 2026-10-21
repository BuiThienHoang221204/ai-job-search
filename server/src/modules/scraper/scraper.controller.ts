import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { Roles } from '@/common/decorators/roles.decorator';
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
  start(@CurrentUser() user: AuthUser, @Body() dto: StartScrapeDto) {
    return this.scraper.start(user.id, dto.portal);
  }
}
