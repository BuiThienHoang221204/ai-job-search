import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { QueueService, type QueueStats } from '../queue/queue.service';

@ApiTags('System Health')
@Controller()
export class HealthController {
  constructor(private readonly queue: QueueService) {}

  @SkipThrottle()
  @Public()
  @ApiOperation({
    summary: 'Liveness probe - Kiểm tra tình trạng hoạt động của ứng dụng',
  })
  @Get('health')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Thống kê hàng đợi - Số job đang chờ, đang chạy, và concurrency mỗi queue',
  })
  @Get('queue/stats')
  async queueStats(): Promise<QueueStats> {
    return this.queue.getStats();
  }
}
