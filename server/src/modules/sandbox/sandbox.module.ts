import { Module } from '@nestjs/common';
import { DockerSandbox } from './docker.sandbox';
import { SANDBOX } from './sandbox.interface';

@Module({
  providers: [{ provide: SANDBOX, useClass: DockerSandbox }],
  exports: [SANDBOX],
})
export class SandboxModule {}
