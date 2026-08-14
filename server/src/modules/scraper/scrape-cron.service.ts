import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { JobSourceRouter } from './job-source.router.js';
import { ScraperService } from './scraper.service.js';

const JOB_NAME = 'scrape.nightly';

/// Quét tin hằng đêm.
///
/// Đăng ký lịch bằng SchedulerRegistry chứ không dùng decorator `@Cron`:
/// decorator đọc giá trị lúc nạp class, nên biểu thức lịch và múi giờ sẽ bị
/// đóng băng thành hằng số và không đọc được từ cấu hình.
@Injectable()
export class ScrapeCronService implements OnModuleInit {
  private readonly logger = new Logger(ScrapeCronService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly scraper: ScraperService,
    private readonly portals: JobSourceRouter,
    private readonly queue: QueueService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('cron.scrapeEnabled')) {
      this.logger.log('Cron quét tin đang TẮT (SCRAPE_CRON_ENABLED=false)');
      return;
    }

    const schedule = this.config.get<string>('cron.scrapeSchedule')!;
    const timeZone = this.config.get<string>('cron.timezone')!;

    const job = new CronJob(
      schedule,
      () => void this.runAllPortals(),
      null,
      false,
      timeZone,
    );
    this.registry.addCronJob(JOB_NAME, job);
    job.start();

    this.logger.log(`Cron quét tin: "${schedule}" theo giờ ${timeZone}`);
  }

  /// Quét lần lượt TỪNG portal, không song song.
  ///
  /// Chạy song song sẽ nhanh hơn nhưng đồng thời đánh vào cả bốn trang - và
  /// nếu máy chủ dùng chung một IP thì đó đúng là dấu hiệu của một con bot.
  /// Quét đêm không có ai ngồi chờ, nên chậm không phải vấn đề.
  async runAllPortals(): Promise<{ portal: string; runId: string }[]> {
    if (this.running) {
      this.logger.warn('Lần quét trước còn đang chạy; bỏ qua lượt này');
      return [];
    }
    this.running = true;

    const started: { portal: string; runId: string }[] = [];
    try {
      const portals = this.portals.listPortals();
      if (!portals.length) {
        this.logger.warn('Không có portal nào được đăng ký; không quét gì');
        return [];
      }

      for (const portal of portals) {
        try {
          // userId = null: đây là lần quét của hệ thống, dùng chung cho mọi
          // người, không thuộc về tài khoản nào.
          const run = await this.scraper.create(null, portal);
          await this.queue.send(QUEUE.SCRAPE_RUN, { runId: run.id });
          started.push({ portal, runId: run.id });
          this.logger.log(`Đã xếp hàng quét ${portal} (run ${run.id})`);
        } catch (error) {
          // Một portal hỏng KHÔNG được chặn ba portal còn lại.
          this.logger.error(
            `Không xếp được hàng quét ${portal}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      return started;
    } finally {
      this.running = false;
    }
  }
}
