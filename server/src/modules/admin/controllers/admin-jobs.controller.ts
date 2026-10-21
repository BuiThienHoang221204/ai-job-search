import {
  Body,
  Controller,
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
import { Roles } from '@/common/decorators/roles.decorator';
import {
  AdminJobsQueryDto,
  JobSourcesQueryDto,
  ReExtractJobsDto,
} from '../admin.dto';
import { AdminJobsService } from '../services/admin-jobs.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/jobs')
@Roles('ADMIN')
export class AdminJobsController {
  constructor(private readonly jobs: AdminJobsService) {}

  @ApiOperation({
    summary:
      'Danh sách tin trong kho, lọc theo nguồn và trạng thái rút yêu cầu',
  })
  @Get()
  list(@Query() query: AdminJobsQueryDto) {
    return this.jobs.list(query);
  }

  @ApiOperation({ summary: 'Các nguồn tin và số tin mỗi nguồn' })
  @Get('sources')
  sources(@Query() query: JobSourcesQueryDto) {
    return this.jobs.sources(query);
  }

  @ApiOperation({
    summary: 'Chi tiết một tin: JD, yêu cầu đã rút, nhóm tin trùng',
  })
  @ApiParam({ name: 'id', description: 'ID của tin' })
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.jobs.detail(id);
  }

  @ApiOperation({
    summary: 'Đưa danh sách tin tuyển dụng vào hàng đợi để rút lại yêu cầu',
  })
  @Post('re-extract')
  @HttpCode(202)
  reExtract(@Body() dto: ReExtractJobsDto) {
    return this.jobs.reExtract(dto.jobIds);
  }
}
