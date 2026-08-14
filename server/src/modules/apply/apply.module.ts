import { Module } from '@nestjs/common';
import { SandboxModule } from '../sandbox/sandbox.module.js';
import { BrowserApplyService } from './browser-apply.service.js';

/**
 * Assisted Apply — adapter THỨ HAI của SEAM 2.
 *
 * Sự tồn tại của module này là điều làm `SandboxRunner` trở thành một seam thật chứ
 * không phải một lớp bọc: hai người dùng độc lập (compile LaTeX và điều khiển trình
 * duyệt) chia nhau cùng một năng lực hệ thống, và chúng khác nhau ở đúng một tham số
 * — `network`.
 */
@Module({
  imports: [SandboxModule],
  providers: [BrowserApplyService],
  exports: [BrowserApplyService],
})
export class ApplyModule {}
