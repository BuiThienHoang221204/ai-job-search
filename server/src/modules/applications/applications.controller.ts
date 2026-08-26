import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ApplicationStatus } from '../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { ApplicationsService } from './applications.service.js';
import { ALL_STATUSES, type StatusGroup } from './transitions.js';

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
  @IsIn(['open', 'interview', 'offer', 'closed'])
  group?: StatusGroup;
}

export class UpdateStatusDto {
  /**
   * Danh sách hợp lệ dựng từ chính enum, không gõ tay lại. Gõ tay lại nghĩa là
   * thêm một trạng thái vào schema mà quên sửa ở đây thì API lặng lẽ từ chối.
   */
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
    return this.applications.list(user.id, query.group, query);
  }

  @ApiOperation({ summary: 'Lấy thông tin chi tiết một đơn ứng tuyển theo ID' })
  @ApiParam({ name: 'id', description: 'ID của đơn ứng tuyển' })
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.applications.get(user.id, id);
  }

  /**
   * Tạo đơn. Chặn nếu công việc chưa chấm điểm hoặc eligibility = FAIL.
   * `skipDocuments=true` chỉ lưu lịch sử, không tự sinh CV/thư — dùng khi
   * người dùng tự nộp trên trang tuyển dụng.
   * `cvDocumentId` ghi nhận CV nào được chọn để nộp.
   */
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

  /**
   * Đổi trạng thái. Luôn là 'user' vì đường vào duy nhất là người dùng bấm
   * nút; hệ thống không có route nào tự đổi trạng thái hộ.
   */
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
