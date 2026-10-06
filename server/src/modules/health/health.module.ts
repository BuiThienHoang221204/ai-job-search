import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [DocumentsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
