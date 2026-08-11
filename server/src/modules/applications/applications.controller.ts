import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ApplicationStatus } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthUser } from '../auth/jwt.strategy.js';
import { ApplicationsService } from './applications.service.js';
import {
  FINAL_STATUSES,
  OPEN_STATUSES,
  type StatusGroup,
} from './transitions.js';

const ALL_STATUSES = [...OPEN_STATUSES, ...FINAL_STATUSES];

export class CreateApplicationDto {
  @IsString() jobId!: string;
}

export class ListApplicationsDto {
  @IsOptional()
  @IsIn(['open', 'interview', 'offer', 'closed'])
  group?: StatusGroup;
}

export class UpdateStatusDto {
  /// Danh sách hợp lệ dựng từ chính enum, không gõ tay lại. Gõ tay lại nghĩa là
  /// thêm một trạng thái vào schema mà quên sửa ở đây thì API lặng lẽ từ chối.
  @IsIn(ALL_STATUSES)
  status!: ApplicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListApplicationsDto) {
    return this.applications.list(user.id, query.group);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.applications.get(user.id, id);
  }

  /// Tạo đơn. Chặn nếu công việc chưa chấm điểm hoặc eligibility = FAIL.
  /// Tự xếp hàng đợi sinh CV và thư xin việc (bước 2-3 của SKILL.md).
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApplicationDto) {
    return this.applications.create(user.id, dto.jobId);
  }

  /// Đổi trạng thái. Luôn là 'user' vì đường vào duy nhất là người dùng bấm
  /// nút; hệ thống không có route nào tự đổi trạng thái hộ.
  @Patch(':id/status')
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
