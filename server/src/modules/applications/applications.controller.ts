import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import {
  ApplicationJobsDto,
  CreateApplicationDto,
  InterviewDateDto,
  ListApplicationsDto,
  UpdateStatusDto,
} from './applications.dto';
import { ApplicationsService } from './applications.service';
import { ThrottleAi } from '@/common/throttle';

@ApiTags('Applications')
@ApiBearerAuth()
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @ApiOperation({
    summary: 'Lấy danh sách các đơn ứng tuyển của người dùng hiện tại',
  })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListApplicationsDto) {
    return this.applications.list(user.id, query, query.status);
  }

  @ApiOperation({
    summary: 'Tin của mọi đơn (tên tin, công ty, logo) để đổ vào ô chọn',
  })
  @Get('jobs')
  jobs(@CurrentUser() user: AuthUser, @Query() query: ApplicationJobsDto) {
    return this.applications.jobOptions(user.id, query.status);
  }

  @ThrottleAi()
  @ApiOperation({ summary: 'Tạo đơn ứng tuyển mới cho một công việc' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApplicationDto) {
    return this.applications.create(user.id, dto.jobId, dto.skipDocuments);
  }

  @ApiOperation({ summary: 'Cập nhật trạng thái đơn ứng tuyển' })
  @ApiParam({ name: 'id', description: 'ID của đơn ứng tuyển' })
  @Put(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.applications.updateStatus(user.id, id, dto.status, dto.note);
  }

  @ApiOperation({ summary: 'Ghi, đổi hoặc xoá (null) ngày phỏng vấn của đơn' })
  @ApiParam({ name: 'id', description: 'ID của đơn ứng tuyển' })
  @Put(':id/interview-date')
  setInterviewDate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: InterviewDateDto,
  ) {
    return this.applications.setInterviewDate(
      user.id,
      id,
      dto.interviewAt === null ? null : new Date(dto.interviewAt),
    );
  }
}
