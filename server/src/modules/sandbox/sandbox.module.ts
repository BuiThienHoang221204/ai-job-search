import { Module } from '@nestjs/common';
import { DockerSandbox } from './docker.sandbox.js';
import { SANDBOX } from './sandbox.interface.js';

/** SEAM 2 · chạy việc nặng trong môi trường cách ly. */
@Module({
  providers: [{ provide: SANDBOX, useClass: DockerSandbox }],
  exports: [SANDBOX],
})
export class SandboxModule {}
