import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ThrottleAi } from '@/common/throttle';
import { ExtAuth } from '../auth/ext-auth.decorator';
import { ExtCompanyDto } from './ext-company.dto';
import { ExtCompanyService } from './ext-company.service';

@ExtAuth()
@Controller('ext/company')
export class ExtCompanyController {
  constructor(private readonly company: ExtCompanyService) {}

  @Post('review')
  @ThrottleAi()
  @HttpCode(200)
  review(@Body() dto: ExtCompanyDto, @Query('force') force?: string) {
    return this.company.review(dto.company, force === '1' || force === 'true');
  }

  @Get()
  result(@Query() dto: ExtCompanyDto) {
    return this.company.result(dto.company);
  }
}
