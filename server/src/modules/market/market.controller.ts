import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { MarketService } from './market.service';

@ApiTags('Public market')
@Controller('public/market')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @ApiOperation({ summary: 'Các ngành có báo cáo thị trường 30 ngày' })
  @Public()
  @Get()
  occupations() {
    return this.market.occupations();
  }

  @ApiOperation({ summary: 'Báo cáo thị trường 30 ngày của một ngành' })
  @ApiParam({ name: 'slug', description: 'Tên ngành dạng không dấu, nối gạch' })
  @Public()
  @Get(':slug')
  report(@Param('slug') slug: string) {
    return this.market.report(slug);
  }
}
