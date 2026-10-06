import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type UpskillReportPayload,
} from '../queue/queue.service';
import { UpskillService } from './upskill.service';

@Injectable()
export class UpskillProcessor implements OnModuleInit {
  private readonly logger = new Logger(UpskillProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly upskill: UpskillService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<UpskillReportPayload>(
      QUEUE.UPSKILL_REPORT,
      async (data) => {
        this.logger.log(`Tạo báo cáo upskill ${data.reportId}`);
        await this.upskill.generate(data.reportId);
      },
    );
  }
}
