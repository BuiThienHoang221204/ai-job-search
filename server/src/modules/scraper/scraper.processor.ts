import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type ScrapeRunPayload,
} from '../queue/queue.service.js';
import { ScraperService } from './services/scraper.service.js';

/** Nhận `SCRAPE_RUN` khỏi hàng đợi rồi gọi `ScraperService.run`. Đây là chỗ một lượt quét THẬT SỰ bắt đầu chạy. */
@Injectable()
export class ScraperProcessor implements OnModuleInit {
  private readonly logger = new Logger(ScraperProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly scraper: ScraperService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<ScrapeRunPayload>(QUEUE.SCRAPE_RUN, async (data) => {
      this.logger.log(`Bắt đầu quét ${data.runId}`);
      await this.scraper.run(data.runId);
    });
  }
}
