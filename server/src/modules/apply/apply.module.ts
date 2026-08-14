import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { SandboxModule } from '../sandbox/sandbox.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AssistedApplyController } from './assisted-apply.controller.js';
import { AssistedApplyProcessor } from './assisted-apply.processor.js';
import { AssistedApplyService } from './assisted-apply.service.js';
import { BrowserApplyService } from './browser-apply.service.js';

/**
 * Assisted Apply — adapter THỨ HAI của SEAM 2.
 *
 * Sự tồn tại của module này là điều làm `SandboxRunner` trở thành một seam thật chứ
 * không phải một lớp bọc: hai người dùng độc lập (compile LaTeX và điều khiển trình
 * duyệt) chia nhau cùng một năng lực hệ thống, và chúng khác nhau ở đúng một tham số
 * — `network`.
 *
 * Phụ thuộc `DocumentsModule` để **compile PDF tại lúc chạy** thay vì dùng một bản
 * cache: `.tex` là nguồn sự thật duy nhất, nên một PDF cũ có thể lệch với nội dung
 * hiện tại của tài liệu.
 */
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
