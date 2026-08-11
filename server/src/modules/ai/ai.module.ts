import { Module } from '@nestjs/common';
import { AiService } from './ai.service.js';
import { ModelCatalogService } from './model-catalog.service.js';

@Module({
  providers: [ModelCatalogService, AiService],
  exports: [ModelCatalogService, AiService],
})
export class AiModule {}
