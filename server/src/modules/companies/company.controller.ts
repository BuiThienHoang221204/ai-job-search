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
import { IsBoolean, IsOptional } from 'class-validator';
import { ThrottleAi } from '../../common/throttle.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { CompanyService } from './company.service.js';

export class RefreshBriefDto {
  /** Chạy lại dù bản hiện có còn hạn. */
  @IsOptional() @IsBoolean() force?: boolean;
}

/**
 * Không có kiểm tra quyền sở hữu vì `Job` và `CompanyBrief` đều là dữ liệu
 * chung, không thuộc về người dùng nào. Tra theo `jobId` chứ không theo tên tự
 * do là để chỉ công ty đã có tin trong database mới tốn được một lượt gọi model.
 */
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

    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    if (!payload) {
      response.write(
        `${JSON.stringify({ type: 'done', result: await this.companies.forJob(jobId) })}\n`,
      );
      response.end();
      return;
    }

    let finished = false;
    response.on('close', () => {
      if (finished) return;
      this.logger.warn(
        `Người dùng rời trang giữa lượt tìm hiểu ${payload.company}; xếp lại vào hàng đợi`,
      );
      void this.queue.send(QUEUE.COMPANY_BRIEF, payload);
    });

    try {
      for await (const event of this.companies.streamBuild(payload.company)) {
        response.write(`${JSON.stringify(event)}\n`);
      }
      finished = true;
    } catch (error) {
      finished = true;
      this.logger.error(
        `Stream tìm hiểu ${jobId} hỏng: ${error instanceof Error ? error.message : String(error)}`,
      );
      response.destroy();
      return;
    }

    response.end();
  }
}
