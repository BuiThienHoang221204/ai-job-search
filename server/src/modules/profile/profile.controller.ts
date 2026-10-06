import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { QuickStartProfileDto, UpdateProfileDto } from './profile.dto';
import { ProfileService } from './profile.service';

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

  @ApiOperation({ summary: 'Cập nhật một phần thông tin hồ sơ người dùng' })
  @Put()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.id, dto);
  }

  @ApiOperation({
    summary: 'Ghi nhanh ngành nghề + kinh nghiệm lúc onboarding',
  })
  @Post('quick-start')
  @HttpCode(200)
  quickStart(@CurrentUser() user: AuthUser, @Body() dto: QuickStartProfileDto) {
    return this.profile.update(user.id, dto as unknown as UpdateProfileDto);
  }
}
