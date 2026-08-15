import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { JobSourceRouter } from './job-source.router.js';
import { ScraperService } from './scraper.service.js';

const JOB_NAME = 'scrape.nightly';

/** Quét tin hằng đêm. */
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

  /** Quét lần lượt TỪNG portal, không song song. */
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
          const run = await this.scraper.create(null, portal);
          await this.queue.send(QUEUE.SCRAPE_RUN, { runId: run.id });
          started.push({ portal, runId: run.id });
          this.logger.log(`Đã xếp hàng quét ${portal} (run ${run.id})`);
        } catch (error) {
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
