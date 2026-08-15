import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { HealthService, type ReadinessReport } from './health.service.js';

/** Hai probe cho orchestrator, và chúng trả lời HAI câu hỏi khác nhau. */
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('health')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (!report.ready) {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
