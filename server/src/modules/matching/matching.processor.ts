import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type EvaluateMatchPayload,
} from '../queue/queue.service.js';
import { MatchingService } from './matching.service.js';

/// Tiêu thụ hàng đợi chấm điểm.
///
/// Đây là "đường ghi" trong kiến trúc: AI chỉ chạy ở đây, chạy trước, chạy
/// nền. Màn hình dashboard không bao giờ đợi nó.
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
