import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type ExtractRequirementsPayload,
} from '../../queue/queue.service.js';
import { JobRequirementsService } from '../services/job-requirements.service.js';

/** Tiêu thụ hàng đợi rút trích yêu cầu của tin (Pha A). */
@Injectable()
export class JobRequirementsProcessor implements OnModuleInit {
  private readonly logger = new Logger(JobRequirementsProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly requirements: JobRequirementsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<ExtractRequirementsPayload>(
      QUEUE.EXTRACT_REQUIREMENTS,
      async (data) => {
        this.logger.log(`Rút yêu cầu job=${data.jobId}`);
        const result = await this.requirements.extract(
          data.jobId,
          data.force ?? false,
        );

        if (result.status === 'DONE') {
          await this.queue.send(QUEUE.SKILL_CANONICALIZE, {
            jobId: data.jobId,
          });
        }
      },
    );
  }
}
