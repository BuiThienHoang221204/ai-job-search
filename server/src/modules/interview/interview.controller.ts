import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthUser } from '../auth/jwt.strategy.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { InterviewService } from './interview.service.js';

export class PrepDto {
  @IsString() jobId!: string;
  @IsOptional() @IsBoolean() force?: boolean;
}

@Controller('interview')
@UseGuards(JwtAuthGuard)
export class InterviewController {
  constructor(
    private readonly interview: InterviewService,
    private readonly queue: QueueService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.interview.list(user.id);
  }

  @Get(':jobId')
  get(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.interview.get(user.id, jobId);
  }

  /// Đường GHI, không đồng bộ.
  @Post('prep')
  async enqueue(@CurrentUser() user: AuthUser, @Body() dto: PrepDto) {
    const id = await this.queue.send(QUEUE.INTERVIEW_PREP, {
      userId: user.id,
      jobId: dto.jobId,
      force: dto.force ?? false,
    });
    return { queued: true, queueJobId: id };
  }

  /// Chạy ngay, dùng để thử nghiệm và đo chất lượng model.
  @Post('prep-sync')
  prepNow(@CurrentUser() user: AuthUser, @Body() dto: PrepDto) {
    return this.interview.generate(user.id, dto.jobId, dto.force ?? false);
  }
}
