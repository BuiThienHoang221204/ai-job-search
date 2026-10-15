import { Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { PublicJobsQueryDto } from './job.dto';
import { JobsService } from './jobs.service';

@ApiTags('Public jobs')
@Controller('public/jobs')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PublicJobsController {
  constructor(private readonly jobs: JobsService) {}

  @ApiOperation({
    summary: 'Danh sách tin cho khách chưa đăng nhập, không kèm lương',
  })
  @Public()
  @Get()
  list(@Query() query: PublicJobsQueryDto) {
    return this.jobs.publicList(query);
  }

  @ApiOperation({
    summary: 'Chi tiết tin cho khách: đoạn trích mô tả, không kèm lương',
  })
  @ApiParam({ name: 'id', description: 'ID của tin tuyển dụng' })
  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.jobs.publicGet(id);
  }
}
