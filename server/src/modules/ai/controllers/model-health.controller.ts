import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { ModelHealthService } from '../services/model-health.service';

@ApiTags('Admin AI Models')
@ApiBearerAuth()
@Controller('admin/ai/models')
@Roles('ADMIN')
export class ModelHealthController {
  constructor(private readonly health: ModelHealthService) {}

  @ApiOperation({ summary: 'Bể model, độ trễ probe và model đang bị cách ly' })
  @Get('health')
  status() {
    return this.health.status();
  }

  @ApiOperation({
    summary: 'Chạy kiểm tra model ở nền, trả ngay trạng thái hiện tại',
  })
  @Post('health-check')
  @HttpCode(200)
  check() {
    void this.health.refresh();
    return this.health.status();
  }
}
