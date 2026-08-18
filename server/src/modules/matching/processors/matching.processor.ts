import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type EvaluateMatchPayload,
} from '../../queue/queue.service.js';
import { MatchingService } from '../services/matching.service.js';

/** Tiêu thụ hàng đợi chấm điểm. */
@Injectable()
export class MatchingProcessor implements OnModuleInit {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly matching: MatchingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<EvaluateMatchPayload>(
      QUEUE.EVALUATE_MATCH,
      async (data) => {
        this.logger.log(`Chấm điểm user=${data.userId} job=${data.jobId}`);
        await this.matching.evaluate(
          data.userId,
          data.jobId,
          data.force ?? false,
        );
      },
    );
  }
}
