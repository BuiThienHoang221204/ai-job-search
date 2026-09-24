import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { QueueService, type QueueStats } from '../queue/queue.service.js';
import { HealthService } from './health.service.js';
import {
  toPublicReadiness,
  type PublicReadiness,
} from './utils/public-readiness.js';

/** Hai probe cho orchestrator, và chúng trả lời HAI câu hỏi khác nhau. */
@ApiTags('System Health')
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly health: HealthService,
    private readonly queue: QueueService,
  ) {}

  // Chỉ liveness bỏ qua throttle: nó không chạm phụ thuộc nào, còn /ready mỗi lần gọi truy vấn DB và có thể chạy docker.
  @SkipThrottle()
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
  async ready(): Promise<PublicReadiness> {
    const report = await this.health.readiness();
    for (const [name, check] of Object.entries(report.checks)) {
      if (check.error)
        this.logger.warn(`Phép kiểm ${name} hỏng: ${check.error}`);
    }
    const body = toPublicReadiness(report);
    if (!report.ready) {
      throw new ServiceUnavailableException(body);
    }
    return body;
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
