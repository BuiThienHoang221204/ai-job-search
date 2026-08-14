import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { UpdateProfileDto } from './dto/profile.dto.js';
import { ProfileService } from './profile.service.js';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profile.get(user.id);
  }

  /// PUT nhưng thân request là MỘT PHẦN hồ sơ, không phải toàn bộ.
  ///
  /// Ghi nhận cho rõ vì nó lệch nghĩa thông thường của PUT: `UpdateProfileDto`
  /// để mọi trường là tuỳ chọn và service chỉ ghi những trường được gửi lên,
  /// đúng như hành vi của PATCH trước đây. Giữ nguyên cách ghi từng phần là có
  /// lý do - gửi cả hồ sơ mỗi lần lưu sẽ khiến một tab mở lâu ghi đè mất thay
  /// đổi mà tab kia vừa lưu.
  @Put()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.id, dto);
  }
}
