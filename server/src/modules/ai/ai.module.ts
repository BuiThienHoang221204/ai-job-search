import { Module } from '@nestjs/common';
import { AiService } from './services/ai.service';
import { ModelBlacklistService } from './services/model-blacklist.service';
import { ModelCatalogService } from './services/model-catalog.service';
import { ModelHealthService } from './services/model-health.service';
import { ModelPoolService } from './services/model-pool.service';
import { ModelHealthController } from './controllers/model-health.controller';

@Module({
  controllers: [ModelHealthController],
  providers: [
    ModelCatalogService,
    ModelPoolService,
    ModelBlacklistService,
    AiService,
    ModelHealthService,
  ],
  exports: [AiService],
})
export class AiModule {}
