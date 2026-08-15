import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/** Probe cho orchestrator. */
@Module({
  imports: [DocumentsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
