import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ApplicationStatus } from '@/generated/prisma/enums';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { ApplicationsService } from './applications.service';
import { ALL_STATUSES } from './transitions';

export class CreateApplicationDto {
  @IsString() jobId!: string;

  @IsOptional()
  skipDocuments?: boolean;

  @IsOptional()
  @IsString()
  cvDocumentId?: string;
}

export class ListApplicationsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ALL_STATUSES)
  status?: ApplicationStatus;
}

export class UpdateStatusDto {
  @IsIn(ALL_STATUSES)
  status!: ApplicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

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

  @ApiOperation({ summary: 'Lấy thông tin chi tiết một đơn ứng tuyển theo ID' })
  @ApiParam({ name: 'id', description: 'ID của đơn ứng tuyển' })
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.applications.get(user.id, id);
  }

  @ApiOperation({ summary: 'Tạo đơn ứng tuyển mới cho một công việc' })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApplicationDto) {
    return this.applications.create(
      user.id,
      dto.jobId,
      dto.skipDocuments,
      dto.cvDocumentId,
    );
  }

  @ApiOperation({ summary: 'Cập nhật trạng thái đơn ứng tuyển' })
  @ApiParam({ name: 'id', description: 'ID của đơn ứng tuyển' })
  @Put(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.applications.updateStatus(
      user.id,
      id,
      dto.status,
      dto.note,
      'user',
    );
  }
}
