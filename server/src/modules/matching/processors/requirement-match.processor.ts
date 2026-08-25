import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type RequirementMatchPayload,
} from '../../queue/queue.service.js';
import { RequirementMatchService } from '../services/requirement-match.service.js';

/** Tiêu thụ hàng đợi đối chiếu hồ sơ với yêu cầu. Không gọi model. */
@Injectable()
export class RequirementMatchProcessor implements OnModuleInit {
  private readonly logger = new Logger(RequirementMatchProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly matches: RequirementMatchService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<RequirementMatchPayload>(
      QUEUE.REQUIREMENT_MATCH,
      async (data) => {
        if (data.jobId) {
          this.logger.log(`Đối chiếu tin job=${data.jobId} với mọi hồ sơ`);
          await this.matches.scoreJob(data.jobId);
          return;
        }
        if (data.userId) {
          this.logger.log(`Đối chiếu hồ sơ user=${data.userId} với mọi tin`);
          await this.matches.scoreUser(data.userId);
          return;
        }
        this.logger.log('Đối chiếu lại toàn bộ kho');
        await this.matches.scoreAll();
      },
    );
  }
}
