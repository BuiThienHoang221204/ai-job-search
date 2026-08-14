import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { CreateJobDto, ListJobsQueryDto } from './dto/job.dto.js';
import { JobsService } from './jobs.service.js';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly queue: QueueService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListJobsQueryDto) {
    return this.jobs.list(query, user.id);
  }

  /// Phải khai TRƯỚC ':id', nếu không Nest sẽ coi "saved" là một id.
  @Get('saved')
  listSaved(@CurrentUser() user: AuthUser) {
    return this.jobs.listSaved(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.get(id, user.id);
  }

  @Post(':id/save')
  @HttpCode(200)
  save(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.save(user.id, id);
  }

  @Delete(':id/save')
  @HttpCode(200)
  unsave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.unsave(user.id, id);
  }

  /// Nạp tin tuyển dụng rồi đưa ngay vào hàng đợi chấm điểm cho người dùng
  /// hiện tại.
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto) {
    const job = await this.jobs.upsert(dto);
    await this.queue.send(QUEUE.EVALUATE_MATCH, {
      userId: user.id,
      jobId: job.id,
    });
    return { job, queued: true };
  }
}
