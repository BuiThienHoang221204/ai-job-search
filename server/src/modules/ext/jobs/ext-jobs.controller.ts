import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ThrottleAuth } from '@/common/throttle';
import type { AuthUser } from '@/common/types/auth-user';
import { ExtAuth } from '../auth/ext-auth.decorator';
import { ExtSaveJobDto } from './ext-jobs.dto';
import { ExtJobsService } from './ext-jobs.service';

@ExtAuth()
@Controller('ext/jobs')
export class ExtJobsController {
  constructor(private readonly jobs: ExtJobsService) {}

  @Post('save')
  @ThrottleAuth()
  @HttpCode(200)
  save(
    @CurrentUser() user: AuthUser,
    @Body() dto: ExtSaveJobDto,
  ): Promise<{ jobId: string; saved: boolean }> {
    return this.jobs.save(user.id, dto);
  }
}
