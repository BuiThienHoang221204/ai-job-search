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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { CreateJobDto, ListJobsQueryDto } from './job.dto.js';
import { JobsService } from './jobs.service.js';

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly queue: QueueService,
  ) {}

  @ApiOperation({
    summary: 'Lấy danh sách các tin tuyển dụng có phân trang và bộ lọc',
  })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListJobsQueryDto) {
    return this.jobs.list(query, user.id);
  }

  /**
   * Danh mục tỉnh/thành và ngành nghề kèm số tin, để giao diện dựng thanh lọc.
   * Phải khai TRƯỚC ':id', nếu không Nest sẽ coi "filters" là một id.
   */
  @ApiOperation({
    summary: 'Lấy danh mục tỉnh thành và ngành nghề kèm số lượng tin để lọc',
  })
  @Get('filters')
  filters() {
    return this.jobs.filters();
  }

  /** Phải khai TRƯỚC ':id', nếu không Nest sẽ coi "saved" là một id. */
  @ApiOperation({
    summary: 'Lấy danh sách các tin tuyển dụng đã lưu của người dùng',
  })
  @Get('saved')
  listSaved(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.jobs.listSaved(user.id, query);
  }

  @ApiOperation({
    summary: 'Lấy thông tin chi tiết một tin tuyển dụng theo ID',
  })
  @ApiParam({ name: 'id', description: 'ID của tin tuyển dụng' })
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.get(id, user.id);
  }

  @ApiOperation({ summary: 'Lưu tin tuyển dụng vào danh sách yêu thích' })
  @ApiParam({ name: 'id', description: 'ID của tin tuyển dụng' })
  @Post(':id/save')
  @HttpCode(200)
  save(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.save(user.id, id);
  }

  @ApiOperation({ summary: 'Bỏ lưu tin tuyển dụng khỏi danh sách yêu thích' })
  @ApiParam({ name: 'id', description: 'ID của tin tuyển dụng' })
  @Delete(':id/save')
  @HttpCode(200)
  unsave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.unsave(user.id, id);
  }

  /**
   * Nạp tin tuyển dụng rồi đưa ngay vào hàng đợi chấm điểm cho người dùng
   * hiện tại.
   */
  @ApiOperation({ summary: 'Tạo/nạp tin tuyển dụng mới và bắt đầu chấm điểm' })
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
