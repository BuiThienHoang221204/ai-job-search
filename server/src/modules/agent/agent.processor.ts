import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type AgentRunPayload,
} from '../queue/queue.service.js';
import { AgentRunnerService } from './agent-runner.service.js';

@Injectable()
export class AgentProcessor implements OnModuleInit {
  private readonly logger = new Logger(AgentProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly runner: AgentRunnerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<AgentRunPayload>(QUEUE.AGENT_RUN, async (data) => {
      this.logger.log(`Chạy agent ${data.runId}`);
      await this.runner.run(data.runId);
    });
  }
}
