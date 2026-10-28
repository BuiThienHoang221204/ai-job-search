import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { MINUTE_MS } from '@/common/duration';
import { CvCheckDto } from './cv-check.dto';
import { CvCheckService } from './cv-check.service';

@ApiTags('CV check (public)')
@Controller('cv-check')
export class CvCheckController {
  constructor(private readonly cvCheck: CvCheckService) {}

  @ApiOperation({
    summary:
      'Chấm CV cho khách: điểm do code tính, AI chỉ tách dòng và nhận xét, có trần lượt theo khách và theo ngày',
  })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 10 * MINUTE_MS } })
  @Post()
  @HttpCode(200)
  check(@Ip() ip: string, @Body() dto: CvCheckDto) {
    return this.cvCheck.check(ip, dto);
  }
}
