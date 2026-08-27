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
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
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

@ApiTags('Upskill Reports')
@ApiBearerAuth()
@Controller('upskill')
export class UpskillController {
  private readonly logger = new Logger(UpskillController.name);

  constructor(
    private readonly upskill: UpskillService,
    private readonly queue: QueueService,
  ) {}

  /** Báo cáo mới nhất đã hoàn thành - màn hình Upskill đọc cái này. */
  @ApiOperation({ summary: 'Lấy báo cáo upskill mới nhất đã hoàn thành' })
  @Get()
  latest(@CurrentUser() user: AuthUser) {
    return this.upskill.latest(user.id);
  }

  @ApiOperation({ summary: 'Lấy lịch sử các báo cáo upskill đã tạo' })
  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.upskill.history(user.id, query);
  }

  @ApiOperation({ summary: 'Lấy chi tiết một báo cáo upskill theo ID' })
  @ApiParam({ name: 'id', description: 'ID của báo cáo upskill' })
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.upskill.get(user.id, id);
  }

  /**
   * Tạo bản ghi PENDING rồi đẩy vào hàng đợi. Trả về reportId để giao diện
   * theo dõi trạng thái.
   */
  @ThrottleAi()
  @ApiOperation({
    summary: 'Tạo báo cáo gợi ý nâng cao kỹ năng và đưa vào hàng đợi xử lý',
  })
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

  @ThrottleAi()
  @ApiOperation({
    summary: 'Tạo báo cáo upskill, đẩy về từng phần ngay khi AI viết (NDJSON)',
  })
  @Post('generate-stream')
  async generateStream(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateUpskillDto,
    @Res() response: Response,
  ): Promise<void> {
    const report = await this.upskill.create(user.id, dto.jobId);

    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    response.write(
      `${JSON.stringify({ type: 'partial', data: { step: 0, reportId: report.id } })}\n`,
    );

    let finished = false;
    response.on('close', () => {
      if (finished) return;
      this.logger.warn(
        `Người dùng rời trang giữa lượt upskill ${report.id}; xếp lại vào hàng đợi`,
      );
      void this.queue.send(QUEUE.UPSKILL_REPORT, {
        userId: user.id,
        reportId: report.id,
      });
    });

    try {
      for await (const event of this.upskill.streamGenerate(report.id)) {
        response.write(`${JSON.stringify(event)}\n`);
      }
      finished = true;
    } catch (error) {
      finished = true;
      this.logger.error(
        `Stream upskill ${report.id} hỏng: ${error instanceof Error ? error.message : String(error)}`,
      );
      response.destroy();
      return;
    }

    response.end();
  }

  /** Chạy ngay, dùng để thử nghiệm. */

  @ThrottleAi()
  @ApiOperation({
    summary: 'Tạo báo cáo upskill đồng bộ ngay lập tức (dùng để thử nghiệm)',
  })
  @Post('generate-sync')
  async generateNow(
    @CurrentUser() user: AuthUser,
    @Body() dto: GenerateUpskillDto,
  ) {
    const report = await this.upskill.create(user.id, dto.jobId);
    return this.upskill.generate(report.id);
  }
}
