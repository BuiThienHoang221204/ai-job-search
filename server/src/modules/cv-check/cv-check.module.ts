import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CvCheckController } from './cv-check.controller';
import { CvCheckService } from './cv-check.service';
import { GuestQuotaService } from './guest-quota.service';

@Module({
  imports: [AiModule],
  controllers: [CvCheckController],
  providers: [CvCheckService, GuestQuotaService],
})
export class CvCheckModule {}
