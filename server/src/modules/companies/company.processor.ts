import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type CompanyBriefPayload,
} from '../queue/queue.service';
import { CompanyService } from './service/company.service';

@Injectable()
export class CompanyProcessor implements OnModuleInit {
  private readonly logger = new Logger(CompanyProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly companies: CompanyService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<CompanyBriefPayload>(
      QUEUE.COMPANY_BRIEF,
      async (data) => {
        this.logger.log(`Tìm hiểu công ty "${data.company}"`);
        await this.companies.build(data.company);
      },
    );
  }
}
