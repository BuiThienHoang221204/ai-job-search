import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/** Probe cho orchestrator. */
@Module({
  imports: [DocumentsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
