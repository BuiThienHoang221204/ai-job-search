import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type InterviewPrepPayload,
} from '../queue/queue.service.js';
import { InterviewService } from './interview.service.js';

@Injectable()
export class InterviewProcessor implements OnModuleInit {
  private readonly logger = new Logger(InterviewProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly interview: InterviewService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<InterviewPrepPayload>(
      QUEUE.INTERVIEW_PREP,
      async (data) => {
        this.logger.log(`Soạn câu hỏi phỏng vấn job=${data.jobId}`);
        await this.interview.generate(
          data.userId,
          data.jobId,
          data.force ?? false,
        );
      },
    );
  }
}
