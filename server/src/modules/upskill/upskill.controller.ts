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
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { QUEUE, QueueService } from '../queue/queue.service';
import { UpskillService } from './upskill.service';
import { streamNdjson } from '@/common/ndjson';
import { ThrottleAi } from '@/common/throttle';

export class GenerateUpskillDto {
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

    await streamNdjson({
      response,
      logger: this.logger,
      label: `upskill ${report.id}`,
      events: this.upskill.streamGenerate(report.id),
      prelude: {
        type: 'partial',
        data: { step: 0, reportId: report.id },
      },
      onAbandon: () =>
        void this.queue.send(QUEUE.UPSKILL_REPORT, {
          userId: user.id,
          reportId: report.id,
        }),
    });
  }

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
