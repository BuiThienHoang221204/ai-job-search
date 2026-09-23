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
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { PrepDto } from './interview.dto.js';
import { InterviewService } from './interview.service.js';
import { streamNdjson } from '../../common/ndjson.js';
import { ThrottleAi } from '../../common/throttle.js';

@ApiTags('Interview Preparation')
@ApiBearerAuth()
@Controller('interview')
export class InterviewController {
  private readonly logger = new Logger(InterviewController.name);

  constructor(private readonly interview: InterviewService) {}

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
    return this.interview.enqueue(user.id, dto.jobId, dto.force ?? false);
  }

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
    await streamNdjson({
      response,
      logger: this.logger,
      label: `soạn câu hỏi ${jobId}`,
      events: this.interview.streamGenerate(user.id, jobId, force === 'true'),
    });
  }

  /** Chạy ngay, dùng để thử nghiệm và đo chất lượng model. */
  @ThrottleAi()
  @ApiOperation({
    summary: 'Tạo tài liệu chuẩn bị phỏng vấn đồng bộ ngay lập tức',
  })
  @Post('prep-sync')
  prepNow(@CurrentUser() user: AuthUser, @Body() dto: PrepDto) {
    return this.interview.generate(user.id, dto.jobId, dto.force ?? false);
  }
}
