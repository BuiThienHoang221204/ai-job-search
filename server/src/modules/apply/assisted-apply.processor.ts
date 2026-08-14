import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type ApplyAssistPayload,
} from '../queue/queue.service.js';
import { AssistedApplyService } from './assisted-apply.service.js';

@Injectable()
export class AssistedApplyProcessor implements OnModuleInit {
  private readonly logger = new Logger(AssistedApplyProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly assisted: AssistedApplyService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<ApplyAssistPayload>(
      QUEUE.APPLY_ASSIST,
      async (data) => {
        this.logger.log(`Mở trang tuyển dụng cho lượt ${data.attemptId}`);
        await this.assisted.execute(data.attemptId);
      },
    );
  }
}
