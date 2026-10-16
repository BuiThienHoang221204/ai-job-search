import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { QUEUE, QueueService } from '../queue/queue.service';
import { GenerateUpskillDto } from './upskill.dto';
import { UpskillService } from './upskill.service';
import { streamNdjson } from '@/common/ndjson';
import { ThrottleAi } from '@/common/throttle';

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
    });
  }
}
