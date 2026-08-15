import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { EvaluateJobDto, ListMatchesQueryDto } from './dto/matching.dto.js';
import { MatchingService } from './matching.service.js';
import { ThrottleAi } from '../../common/throttle.js';

@Controller('matches')
export class MatchingController {
  constructor(
    private readonly matching: MatchingService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Đường ĐỌC. Chỉ truy vấn DB, không gọi AI - màn hình dashboard và danh
   * sách việc làm đều vào đây.
   */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListMatchesQueryDto) {
    return this.matching.listMatches(
      user.id,
      query.limit ?? 20,
      query.offset ?? 0,
    );
  }

  @Get(':jobId')
  get(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.matching.getMatch(user.id, jobId);
  }

  /**
   * Đường GHI, không đồng bộ. Trả về ngay, worker chấm điểm ở nền; giao diện
   * hiện trạng thái PENDING rồi cập nhật sau.
   */
  @ThrottleAi()
  @Post('evaluate')
  async enqueue(@CurrentUser() user: AuthUser, @Body() dto: EvaluateJobDto) {
    const id = await this.queue.send(QUEUE.EVALUATE_MATCH, {
      userId: user.id,
      jobId: dto.jobId,
      force: dto.force ?? false,
    });
    return { queued: true, queueJobId: id };
  }

  /**
   * Chấm điểm đồng bộ, dùng để thử nghiệm và đo chất lượng model.
   * Không dùng cho giao diện: một lần gọi mất vài giây.
   */
  @ThrottleAi()
  @Post('evaluate-sync')
  evaluateNow(@CurrentUser() user: AuthUser, @Body() dto: EvaluateJobDto) {
    return this.matching.evaluate(user.id, dto.jobId, dto.force ?? false);
  }
}
