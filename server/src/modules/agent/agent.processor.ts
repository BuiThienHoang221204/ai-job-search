import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type AgentReviewPayload,
  type AgentRunPayload,
} from '../queue/queue.service.js';
import { AgentRunnerService } from './services/agent-runner.service.js';
import { AgentReviewService } from './services/agent-review.service.js';

/** Kịch bản có vòng phản biện chạy sau khi đã trả kết quả cho người dùng. */
const REVIEWED_WORKFLOWS = new Set(['apply']);

@Injectable()
export class AgentProcessor implements OnModuleInit {
  private readonly logger = new Logger(AgentProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly runner: AgentRunnerService,
    private readonly reviewer: AgentReviewService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<AgentRunPayload>(QUEUE.AGENT_RUN, async (data) => {
      this.logger.log(`Chạy agent ${data.runId}`);
      const run = await this.runner.run(data.runId);

      /*
       * Phản biện xếp hàng SAU khi lượt chạy đã DONE, không nằm trong vòng lặp
       * agent nữa. Đo trên 114 bước `/apply` thật: nó là 19,7% quãng chờ, mà
       * lúc nó chạy thì CV đã nằm sẵn trên màn hình rồi.
       *
       * Đánh dấu PENDING trước khi gửi, để giao diện biết còn thứ đang tới chứ
       * không kết luận là không có góp ý nào.
       */
      if (run.status !== 'DONE' || !REVIEWED_WORKFLOWS.has(run.workflow))
        return;

      await this.runner.markReviewPending(run.id);
      await this.queue.send(QUEUE.AGENT_REVIEW, {
        runId: run.id,
        userId: run.userId,
      });
    });

    await this.queue.work<AgentReviewPayload>(
      QUEUE.AGENT_REVIEW,
      async (data) => {
        this.logger.log(`Phản biện hồ sơ của lượt ${data.runId}`);
        await this.reviewer.review(data.runId);
      },
    );
  }
}
