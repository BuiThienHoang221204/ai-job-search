import { Module } from '@nestjs/common';
import { AiService } from './services/ai.service.js';
import { ModelCatalogService } from './services/model-catalog.service.js';

@Module({
  providers: [ModelCatalogService, AiService],
  exports: [ModelCatalogService, AiService],
})
export class AiModule {}
