import { Module } from '@nestjs/common';
import { AiService } from './services/ai.service';
import { ModelCatalogService } from './services/model-catalog.service';

@Module({
  providers: [ModelCatalogService, AiService],
  exports: [AiService],
})
export class AiModule {}
