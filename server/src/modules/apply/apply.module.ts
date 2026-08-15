import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { SandboxModule } from '../sandbox/sandbox.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AssistedApplyController } from './assisted-apply.controller.js';
import { AssistedApplyProcessor } from './assisted-apply.processor.js';
import { AssistedApplyService } from './assisted-apply.service.js';
import { BrowserApplyService } from './browser-apply.service.js';

/** Assisted Apply — adapter THỨ HAI của SEAM 2. */
@Module({
  imports: [SandboxModule, QueueModule, StorageModule, DocumentsModule],
  controllers: [AssistedApplyController],
  providers: [
    BrowserApplyService,
    AssistedApplyService,
    AssistedApplyProcessor,
  ],
  exports: [BrowserApplyService, AssistedApplyService],
})
export class ApplyModule {}
