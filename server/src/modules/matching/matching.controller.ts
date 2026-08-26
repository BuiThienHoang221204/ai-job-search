import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
import { MatchingService } from './services/matching.service.js';
import { JobRequirementsService } from './services/job-requirements.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ThrottleAi } from '../../common/throttle.js';

@ApiTags('Matching & Scoring')
@ApiBearerAuth()
@Controller('matches')
export class MatchingController {
  constructor(
    private readonly matching: MatchingService,
    private readonly queue: QueueService,
    private readonly requirements: JobRequirementsService,
  ) {}

  /**
   * Đường ĐỌC. Chỉ truy vấn DB, không gọi AI - màn hình dashboard và danh
   * sách việc làm đều vào đây.
   */
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
  get(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.matching.getMatch(user.id, jobId);
  }

  /**
   * Đường GHI, không đồng bộ. Trả về ngay, worker chấm điểm ở nền; giao diện
   * hiện trạng thái PENDING rồi cập nhật sau.
   */
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

  /**
   * Dựng danh bạ kỹ năng cho toàn bộ kho. Trả về ngay: việc chạy theo từng lô ở
   * hàng đợi nền, mỗi lô tự xếp lô kế cho tới khi hết cách viết chưa biết.
   */
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Tái cấu trúc danh bạ kỹ năng chuẩn hóa (Admin)' })
  @Post('dictionary/rebuild')
  async rebuildDictionary() {
    const id = await this.queue.send(QUEUE.SKILL_CANONICALIZE, { round: 0 });
    return { queued: true, queueJobId: id };
  }

  /**
   * Chấm điểm đồng bộ, dùng để thử nghiệm và đo chất lượng model.
   * Không dùng cho giao diện: một lần gọi mất vài giây.
   */
  @ThrottleAi()
  @ApiOperation({
    summary: 'Đánh giá độ tương thích công việc đồng bộ ngay lập tức',
  })
  @Post('evaluate-sync')
  evaluateNow(@CurrentUser() user: AuthUser, @Body() dto: EvaluateJobDto) {
    return this.matching.evaluate(user.id, dto.jobId, dto.force ?? false);
  }
}
