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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { EvaluateJobDto, ListMatchesQueryDto } from './matching.dto.js';
import { MatchingService } from './ai/services/matching.service.js';
import { JobRequirementsService } from './ai/services/job-requirements.service.js';
import { AiShortlistService } from './rules/services/ai-shortlist.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { streamNdjson } from '../../common/ndjson.js';
import { ThrottleAi } from '../../common/throttle.js';
import { withFailureKind } from '../ai/utils/failure-view.js';

@ApiTags('Matching & Scoring')
@ApiBearerAuth()
@Controller('matches')
export class MatchingController {
  private readonly logger = new Logger(MatchingController.name);

  constructor(
    private readonly matching: MatchingService,
    private readonly queue: QueueService,
    private readonly requirements: JobRequirementsService,
    private readonly shortlist: AiShortlistService,
  ) {}

  /** Đường ĐỌC, chỉ truy vấn DB — dashboard và danh sách việc làm đều vào đây. */
  @ApiOperation({
    summary: 'Lấy danh sách điểm tương thích công việc của người dùng',
  })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListMatchesQueryDto) {
    return this.matching.listMatches(user.id, query);
  }

  @ApiOperation({ summary: 'Lấy điểm tương thích chi tiết của một công việc' })
  @ApiParam({ name: 'jobId', description: 'ID của tin tuyển dụng' })
  @Get(':jobId')
  async get(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    const match = await this.matching.getMatch(user.id, jobId);
    return match && withFailureKind(match);
  }

  /** Đường GHI không đồng bộ: trả về ngay, worker chấm ở nền, giao diện hiện PENDING rồi cập nhật. */
  @ThrottleAi()
  @ApiOperation({
    summary: 'Đưa yêu cầu đánh giá độ tương thích công việc vào hàng đợi',
  })
  @Post('evaluate')
  async enqueue(@CurrentUser() user: AuthUser, @Body() dto: EvaluateJobDto) {
    const force = dto.force ?? false;

    if (!force) {
      const done = await this.matching.findDoneScore(user.id, dto.jobId);
      if (done) return { queued: false, alreadyScored: true, ...done };
    }

    await this.matching.markPending(user.id, dto.jobId);

    const id = await this.queue.send(QUEUE.EVALUATE_MATCH, {
      userId: user.id,
      jobId: dto.jobId,
      force,
    });
    return { queued: true, alreadyScored: false, queueJobId: id };
  }

  /** Rút yêu cầu của một tin ngay (Pha A). Dùng để đo chất lượng rút trích. */
  @Roles('ADMIN')
  @ThrottleAi()
  @ApiOperation({
    summary: 'Trích xuất các yêu cầu công việc từ JD bằng AI (Admin)',
  })
  @ApiParam({ name: 'jobId', description: 'ID của tin tuyển dụng' })
  @ApiQuery({
    name: 'force',
    type: String,
    required: false,
    description: 'Bắt buộc chạy lại ("true"/"false")',
  })
  @Post('requirements/:jobId')
  extractRequirements(
    @Param('jobId') jobId: string,
    @Query('force') force?: string,
  ) {
    return this.requirements.extract(jobId, force === 'true');
  }

  /** Trả về ngay: việc chạy theo từng lô ở hàng đợi nền, mỗi lô tự xếp lô kế cho tới khi hết. */
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Tái cấu trúc danh bạ kỹ năng chuẩn hóa (Admin)' })
  @Post('dictionary/rebuild')
  async rebuildDictionary() {
    const id = await this.queue.send(QUEUE.SKILL_CANONICALIZE, { round: 0 });
    return { queued: true, queueJobId: id };
  }

  /** Chạy ĐỒNG BỘ để đọc được ngay số suất đã phát, thay vì đợi lượt quét kế. */
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Phát suất AI cho top-N tin phù hợp nhất (Admin)' })
  @ApiQuery({
    name: 'userId',
    type: String,
    required: false,
    description: 'Chỉ phát cho một hồ sơ; bỏ trống thì phát cho mọi hồ sơ',
  })
  @Post('shortlist/dispatch')
  dispatchShortlist(@Query('userId') userId?: string) {
    return this.shortlist.dispatch(userId);
  }

  @ThrottleAi()
  @ApiOperation({
    summary: 'Chấm điểm và đẩy về từng phần ngay khi model viết ra (NDJSON)',
  })
  @ApiParam({ name: 'jobId', description: 'ID của tin tuyển dụng' })
  @Post('evaluate-stream/:jobId')
  async evaluateStream(
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Query('force') force: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    await streamNdjson({
      response,
      logger: this.logger,
      label: `chấm điểm ${jobId}`,
      events: this.matching.streamEvaluate(user.id, jobId, force === 'true'),
    });
  }

  /** Chấm điểm đồng bộ, dùng để thử nghiệm và đo chất lượng model — một lần gọi mất vài giây. */
  @ThrottleAi()
  @ApiOperation({
    summary: 'Đánh giá độ tương thích công việc đồng bộ ngay lập tức',
  })
  @Post('evaluate-sync')
  async evaluateNow(
    @CurrentUser() user: AuthUser,
    @Body() dto: EvaluateJobDto,
  ) {
    return withFailureKind(
      await this.matching.evaluate(user.id, dto.jobId, dto.force ?? false),
    );
  }
}
