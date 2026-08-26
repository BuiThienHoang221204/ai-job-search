import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { DashboardService } from './dashboard.service.js';

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
}
