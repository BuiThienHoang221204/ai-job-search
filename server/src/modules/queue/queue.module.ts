import { Global, Module } from '@nestjs/common';
import { QueueConfigService } from './queue-config.service';
import { QueueService } from './queue.service';

@Global()
@Module({
  providers: [QueueService, QueueConfigService],
  exports: [QueueService, QueueConfigService],
})
export class QueueModule {}
