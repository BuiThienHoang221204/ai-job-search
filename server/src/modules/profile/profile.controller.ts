import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { UpdateProfileDto } from './profile.dto.js';
import { ProfileService } from './profile.service.js';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @ApiOperation({ summary: 'Lấy thông tin hồ sơ của người dùng hiện tại' })
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profile.get(user.id);
  }

  /** PUT nhưng thân request là MỘT PHẦN hồ sơ, không phải toàn bộ. */
  @ApiOperation({ summary: 'Cập nhật một phần thông tin hồ sơ người dùng' })
  @Put()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.id, dto);
  }
}
