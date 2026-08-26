import { Global, Module } from '@nestjs/common';
import { QueueConfigService } from './queue-config.service.js';
import { QueueService } from './queue.service.js';

@Global()
@Module({
  providers: [QueueService, QueueConfigService],
  exports: [QueueService, QueueConfigService],
})
export class QueueModule {}
