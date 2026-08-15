import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { UpskillService } from './upskill.service.js';
import { ThrottleAi } from '../../common/throttle.js';

export class GenerateUpskillDto {
  /**
   * Có jobId thì phân tích một công việc (chế độ TARGETED trong skill gốc);
   * không có thì tổng hợp toàn bộ (chế độ AGGREGATE).
   */
  @IsOptional() @IsString() jobId?: string;
}

@Controller('upskill')
export class UpskillController {
  constructor(
    private readonly upskill: UpskillService,
    private readonly queue: QueueService,
  ) {}

  /** Báo cáo mới nhất đã hoàn thành - màn hình Upskill đọc cái này. */
  @Get()
  latest(@CurrentUser() user: AuthUser) {
    return this.upskill.latest(user.id);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.upskill.history(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.upskill.get(user.id, id);
  }

  /**
   * Tạo bản ghi PENDING rồi đẩy vào hàng đợi. Trả về reportId để giao diện
   * theo dõi trạng thái.
   */
  @ThrottleAi()
  @Post('generate')
  async enqueue(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateUpskillDto,
  ) {
    const report = await this.upskill.create(user.id, dto.jobId);
    await this.queue.send(QUEUE.UPSKILL_REPORT, {
      userId: user.id,
      reportId: report.id,
    });
    return { queued: true, reportId: report.id, mode: report.mode };
  }

  /** Chạy ngay, dùng để thử nghiệm. */
  @ThrottleAi()
  @Post('generate-sync')
  async generateNow(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateUpskillDto,
  ) {
    const report = await this.upskill.create(user.id, dto.jobId);
    return this.upskill.generate(report.id);
  }
}
