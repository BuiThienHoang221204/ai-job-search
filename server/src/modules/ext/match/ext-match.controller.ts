import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ThrottleAi } from '@/common/throttle';
import type { AuthUser } from '@/common/types/auth-user';
import { ExtAuth } from '../auth/ext-auth.decorator';
import { ExtSaveJobDto } from '../jobs/ext-jobs.dto';
import { ExtMatchService } from './ext-match.service';

@ExtAuth()
@Controller('ext/match')
export class ExtMatchController {
  constructor(private readonly match: ExtMatchService) {}

  @Post('quick')
  @ThrottleAi()
  @HttpCode(200)
  quick(@CurrentUser() user: AuthUser, @Body() dto: ExtSaveJobDto) {
    return this.match.quick(user.id, dto);
  }

  @Get(':jobId')
  result(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.match.result(user.id, jobId);
  }
}
