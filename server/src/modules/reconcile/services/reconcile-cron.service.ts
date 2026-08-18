import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ReconcileService } from './reconcile.service.js';

const JOB_NAME = 'reconcile.stuck-work';

/** Lịch chạy `ReconcileService`. */
@Injectable()
export class ReconcileCronService implements OnModuleInit {
  private readonly logger = new Logger(ReconcileCronService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly reconcile: ReconcileService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('cron.reconcileEnabled')) {
      this.logger.log(
        'Cron nhặt việc rơi đang TẮT (RECONCILE_CRON_ENABLED=false)',
      );
      return;
    }

    const schedule = this.config.get<string>('cron.reconcileSchedule')!;
    const timeZone = this.config.get<string>('cron.timezone')!;

    const job = new CronJob(
      schedule,
      () => void this.runOnce(),
      null,
      false,
      timeZone,
    );
    this.registry.addCronJob(JOB_NAME, job);
    job.start();

    this.logger.log(`Cron nhặt việc rơi: "${schedule}" theo giờ ${timeZone}`);
  }

  /** Một lượt quét, có chốt chống chồng lượt. */
  async runOnce(): Promise<void> {
    if (this.running) {
      this.logger.warn('Lượt nhặt trước còn đang chạy; bỏ qua lượt này');
      return;
    }
    this.running = true;
    try {
      await this.reconcile.run();
    } catch (error) {
      this.logger.error(
        `Lượt nhặt việc rơi thất bại: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
