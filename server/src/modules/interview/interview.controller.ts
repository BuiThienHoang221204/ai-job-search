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
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { InterviewService } from './interview.service.js';
import { ThrottleAi } from '../../common/throttle.js';

export class PrepDto {
  @IsString() jobId!: string;
  @IsOptional() @IsBoolean() force?: boolean;
}

@ApiTags('Interview Preparation')
@ApiBearerAuth()
@Controller('interview')
export class InterviewController {
  private readonly logger = new Logger(InterviewController.name);

  constructor(
    private readonly interview: InterviewService,
    private readonly queue: QueueService,
  ) {}

  @ApiOperation({
    summary: 'Lấy danh sách các tài liệu chuẩn bị phỏng vấn của người dùng',
  })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.interview.list(user.id, query);
  }

  @ApiOperation({
    summary: 'Lấy tài liệu chuẩn bị phỏng vấn theo ID tin tuyển dụng',
  })
  @ApiParam({ name: 'jobId', description: 'ID của tin tuyển dụng' })
  @Get(':jobId')
  get(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.interview.get(user.id, jobId);
  }

  /** Đường GHI, không đồng bộ. */
  @ThrottleAi()
  @ApiOperation({
    summary: 'Đưa yêu cầu chuẩn bị phỏng vấn vào hàng đợi xử lý',
  })
  @Post('prep')
  async enqueue(@CurrentUser() user: AuthUser, @Body() dto: PrepDto) {
    const id = await this.queue.send(QUEUE.INTERVIEW_PREP, {
      userId: user.id,
      jobId: dto.jobId,
      force: dto.force ?? false,
    });
    return { queued: true, queueJobId: id };
  }

  /** Chạy ngay, dùng để thử nghiệm và đo chất lượng model. */
  @ThrottleAi()
  @ApiOperation({
    summary: 'Tạo tài liệu chuẩn bị phỏng vấn đồng bộ ngay lập tức',
  })
  @ThrottleAi()
  @ApiOperation({
    summary: 'Soạn câu hỏi và đẩy về từng phần ngay khi AI viết ra (NDJSON)',
  })
  @ApiParam({ name: 'jobId', description: 'ID của tin tuyển dụng' })
  @Post('prep-stream/:jobId')
  async prepStream(
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Query('force') force: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    try {
      for await (const event of this.interview.streamGenerate(
        user.id,
        jobId,
        force === 'true',
      )) {
        response.write(`${JSON.stringify(event)}\n`);
      }
    } catch (error) {
      this.logger.error(
        `Stream soạn câu hỏi ${jobId} hỏng: ${error instanceof Error ? error.message : String(error)}`,
      );
      response.destroy();
      return;
    }

    response.end();
  }

  @Post('prep-sync')
  prepNow(@CurrentUser() user: AuthUser, @Body() dto: PrepDto) {
    return this.interview.generate(user.id, dto.jobId, dto.force ?? false);
  }
}
