import { Module } from '@nestjs/common';
import { DockerSandbox } from './docker.sandbox.js';
import { SANDBOX } from './sandbox.interface.js';

/**
 * SEAM 2 · chạy việc nặng trong môi trường cách ly.
 *
 * Một adapter (`DockerSandbox`) nhưng seam vẫn chính đáng: adapter thứ hai đã nằm
 * trong lộ trình — Assisted Apply (Pha 5) cần đúng năng lực này để chạy Playwright.
 * Đó là ngoại lệ duy nhất của quy tắc "chỉ tạo seam khi có adapter thứ hai".
 */
@Module({
  providers: [{ provide: SANDBOX, useClass: DockerSandbox }],
  exports: [SANDBOX],
})
export class SandboxModule {}
