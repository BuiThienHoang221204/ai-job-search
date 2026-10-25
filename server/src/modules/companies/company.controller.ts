import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { Public } from '@/common/decorators/public.decorator';
import { justDone, streamNdjson } from '@/common/ndjson';
import { ThrottleAi } from '@/common/throttle';
import { QUEUE, QueueService } from '../queue/queue.service';
import { FollowCompanyDto, RefreshBriefDto } from './company.dto';
import { CompanyFollowService } from './services/company-follow.service';
import { CompanyService } from './services/company.service';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompanyController {
  private readonly logger = new Logger(CompanyController.name);

  constructor(
    private readonly companies: CompanyService,
    private readonly follows: CompanyFollowService,
    private readonly queue: QueueService,
  ) {}

  @ApiOperation({ summary: 'Các công ty mình đang theo dõi' })
  @Get('follows')
  listFollows(@CurrentUser() user: AuthUser) {
    return this.follows.list(user.id);
  }

  @ApiOperation({ summary: 'Theo dõi công ty của một tin tuyển dụng' })
  @Post('follows')
  follow(@CurrentUser() user: AuthUser, @Body() dto: FollowCompanyDto) {
    return this.follows.follow(user.id, dto.jobId);
  }

  @ApiOperation({ summary: 'Bỏ theo dõi một công ty' })
  @Delete('follows/:id')
  unfollow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.follows.unfollow(user.id, id);
  }

  @ApiOperation({
    summary: 'Lấy thông tin tóm tắt công ty theo ID tin tuyển dụng',
  })
  @ApiParam({ name: 'jobId', description: 'ID của tin tuyển dụng' })
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('brief/by-job/:jobId')
  brief(@Param('jobId') jobId: string) {
    return this.companies.forJob(jobId);
  }

  @ThrottleAi()
  @ApiOperation({
    summary: 'Làm mới thông tin tóm tắt công ty của tin tuyển dụng bằng AI',
  })
  @ApiParam({ name: 'jobId', description: 'ID của tin tuyển dụng' })
  @Post('brief/by-job/:jobId')
  async refresh(@Param('jobId') jobId: string, @Body() dto: RefreshBriefDto) {
    const payload = await this.companies.planRefresh(jobId, dto.force === true);
    if (!payload) return { queued: false, reason: 'còn hạn' };

    await this.queue.send(QUEUE.COMPANY_BRIEF, payload);
    return { queued: true, company: payload.company };
  }

  @ThrottleAi()
  @ApiOperation({
    summary:
      'Tìm hiểu công ty và đẩy về từng phần ngay khi AI viết ra (NDJSON)',
  })
  @ApiParam({ name: 'jobId', description: 'ID của tin tuyển dụng' })
  @Post('brief/by-job/:jobId/stream')
  async refreshStream(
    @Param('jobId') jobId: string,
    @Query('force') force: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const payload = await this.companies.planRefresh(jobId, force === 'true');

    if (!payload) {
      await streamNdjson({
        response,
        logger: this.logger,
        label: `tìm hiểu ${jobId}`,
        events: justDone(await this.companies.forJob(jobId)),
      });
      return;
    }

    await streamNdjson({
      response,
      logger: this.logger,
      label: `tìm hiểu ${jobId}`,
      events: this.companies.streamBuild(payload.company),
    });
  }
}
