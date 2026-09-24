import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { ScrapeBatchesQueryDto, ScrapePortalsQueryDto } from '../admin.dto.js';
import { AdminScrapeService } from '../services/admin-scrape.service.js';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/scrape')
@Roles('ADMIN')
export class AdminScrapeController {
  constructor(private readonly scrape: AdminScrapeService) {}

  /** `cap` là trần `scraper.maxJobsPerPortal`: lượt lấy đủ trần là portal còn tin nhưng bị cắt. */
  @ApiOperation({
    summary:
      'Tình trạng từng portal: lượt gần nhất, số lần hỏng, xu hướng tin mới',
  })
  @Get('portals')
  portals(@Query() query: ScrapePortalsQueryDto) {
    return this.scrape.portals(query);
  }

  @ApiOperation({
    summary: 'Lịch sử quét gom theo lượt đêm, mỗi lượt gồm kết quả từng portal',
  })
  @Get('batches')
  batches(@Query() query: ScrapeBatchesQueryDto) {
    return this.scrape.batches(query);
  }
}
