import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../../common/types/auth-user.js';
import { UpdateUserRoleDto, UsersQueryDto } from '../admin.dto.js';
import { AdminUsersService } from '../services/admin-users.service.js';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/users')
@Roles('ADMIN')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @ApiOperation({ summary: 'Danh sách tài khoản, tìm theo email hoặc tên' })
  @Get()
  list(@Query() query: UsersQueryDto) {
    return this.users.list(query);
  }

  @ApiOperation({ summary: 'Chi tiết một tài khoản và mức dùng AI' })
  @ApiParam({ name: 'id', description: 'ID người dùng' })
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }

  /** Vai trò đọc tươi từ DB mỗi request nên đổi xong có hiệu lực ngay. */
  @ApiOperation({ summary: 'Đổi vai trò USER / ADMIN' })
  @ApiParam({ name: 'id', description: 'ID người dùng' })
  @Put(':id/role')
  updateRole(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.users.updateRole(actor.id, id, dto.role);
  }
}
