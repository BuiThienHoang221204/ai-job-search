import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type AiShortlistPayload,
} from '../../queue/queue.service.js';
import { AiShortlistService } from '../services/ai-shortlist.service.js';

@Injectable()
export class AiShortlistProcessor implements OnModuleInit {
  private readonly logger = new Logger(AiShortlistProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly shortlist: AiShortlistService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<AiShortlistPayload>(
      QUEUE.AI_SHORTLIST,
      async (data) => {
        this.logger.log(
          data.userId
            ? `Chọn tin cho AI chấm: user=${data.userId}`
            : 'Chọn tin cho AI chấm: mọi hồ sơ',
        );
        await this.shortlist.dispatch(data.userId);
      },
    );
  }
}
