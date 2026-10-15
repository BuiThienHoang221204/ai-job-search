import {
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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@/common/decorators/public.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { ListJobsQueryDto } from './job.dto';
import { JobsService } from './jobs.service';

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @ApiOperation({
    summary: 'Lấy danh sách các tin tuyển dụng có phân trang và bộ lọc',
  })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListJobsQueryDto) {
    return this.jobs.list(query, user.id);
  }

  @ApiOperation({
    summary: 'Lấy danh mục tỉnh thành và ngành nghề kèm số lượng tin để lọc',
  })
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('filters')
  filters() {
    return this.jobs.filters();
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
}
