import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ThrottleAi } from '@/common/throttle';
import type { AuthUser } from '@/common/types/auth-user';
import { ExtAuth } from '../auth/ext-auth.decorator';
import { ExtSaveJobDto } from '../jobs/ext-jobs.dto';
import { UpskillPlanDto } from './ext-upskill.dto';
import { ExtUpskillService } from './ext-upskill.service';

@ExtAuth()
@Controller('ext/upskill')
export class ExtUpskillController {
  constructor(private readonly upskill: ExtUpskillService) {}

  @Post('gaps')
  @ThrottleAi()
  @HttpCode(200)
  gaps(@CurrentUser() user: AuthUser, @Body() dto: ExtSaveJobDto) {
    return this.upskill.gaps(user.id, dto);
  }

  @Post('plan')
  @ThrottleAi()
  @HttpCode(200)
  plan(@CurrentUser() user: AuthUser, @Body() dto: UpskillPlanDto) {
    return this.upskill.plan(user.id, dto);
  }
}
