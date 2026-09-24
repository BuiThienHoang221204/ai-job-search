import {
  Body,
  Controller,
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
import { justDone, streamNdjson } from '../../common/ndjson.js';
import { ThrottleAi } from '../../common/throttle.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { RefreshBriefDto } from './company.dto.js';
import { CompanyService } from './service/company.service.js';

/** Không kiểm quyền sở hữu: `Job` và `CompanyBrief` là dữ liệu chung. */
@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompanyController {
  private readonly logger = new Logger(CompanyController.name);

  constructor(
    private readonly companies: CompanyService,
    private readonly queue: QueueService,
  ) {}

  @ApiOperation({
    summary: 'Lấy thông tin tóm tắt công ty theo ID tin tuyển dụng',
  })
  @ApiParam({ name: 'jobId', description: 'ID của tin tuyển dụng' })
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
      onAbandon: () => void this.queue.send(QUEUE.COMPANY_BRIEF, payload),
    });
  }
}
