import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
}
