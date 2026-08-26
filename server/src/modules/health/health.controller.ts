import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { QueueService, type QueueStats } from '../queue/queue.service.js';
import { HealthService, type ReadinessReport } from './health.service.js';

/** Hai probe cho orchestrator, và chúng trả lời HAI câu hỏi khác nhau. */
@SkipThrottle()
@ApiTags('System Health')
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly queue: QueueService,
  ) {}

  @Public()
  @ApiOperation({
    summary: 'Liveness probe - Kiểm tra tình trạng hoạt động của ứng dụng',
  })
  @Get('health')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @ApiOperation({
    summary:
      'Readiness probe - Kiểm tra độ sẵn sàng của các tài nguyên hệ thống (DB, S3...)',
  })
  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (!report.ready) {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }

  @Public()
  @ApiOperation({
    summary:
      'Thống kê hàng đợi - Số job đang chờ, đang chạy, và concurrency mỗi queue',
  })
  @Get('queue/stats')
  async queueStats(): Promise<QueueStats> {
    return this.queue.getStats();
  }
}
