import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthUser } from '@/common/types/auth-user';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @ApiOperation({ summary: 'Lấy thông tin tổng quan dashboard cho người dùng' })
  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.dashboard.overview(user.id);
  }

  @ApiOperation({
    summary: 'Kỹ năng tin cùng ngành hay yêu cầu mà hồ sơ chưa có',
  })
  @Get('skill-gaps')
  skillGaps(@CurrentUser() user: AuthUser) {
    return this.dashboard.skillGaps(user.id);
  }
}
