import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ReconcileService } from './reconcile.service.js';

const JOB_NAME = 'reconcile.stuck-work';

/// Lịch chạy `ReconcileService`.
///
/// Tách khỏi chính service vì hai lý do, không phải để chia file cho đẹp:
///
/// 1. Đăng ký cron trong `onModuleInit` của service nghĩa là bộ khung test cũng
///    dựng một cron thật mỗi lần dựng app.
/// 2. Việc quét lại là logic thuần, kiểm được bằng cách gọi trực tiếp; còn lịch
///    thì phải đọc cấu hình. Trộn hai thứ làm cả hai khó kiểm hơn.
///
/// Dùng SchedulerRegistry chứ không decorator `@Cron`, cùng lý do như
/// `ScrapeCronService`: decorator đóng băng biểu thức lịch thành hằng số lúc nạp
/// class nên không đọc được từ cấu hình.
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

  /// Một lượt quét, có chốt chống chồng lượt.
  ///
  /// Chốt này chỉ là boolean trong tiến trình, nên nó KHÔNG chặn được hai instance
  /// chạy song song. Chấp nhận được ở đây, khác với cron quét portal: việc xếp lại
  /// idempotent theo khoá của hàng đợi, nên hai instance cùng quét chỉ tạo ra
  /// message trùng và bị chặn, không gây hại. Cần chặn thật thì phải dùng advisory
  /// lock của Postgres - việc của giai đoạn chạy nhiều instance.
  async runOnce(): Promise<void> {
    if (this.running) {
      this.logger.warn('Lượt nhặt trước còn đang chạy; bỏ qua lượt này');
      return;
    }
    this.running = true;
    try {
      await this.reconcile.run();
    } catch (error) {
      // Một lượt hỏng không được làm chết cron: lượt sau vẫn phải chạy.
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
