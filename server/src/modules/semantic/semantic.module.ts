import { Module } from '@nestjs/common';
import { LocalEmbedder } from './local.embedder';
import { SEMANTIC_INDEX } from './semantic-index';

@Module({
  providers: [{ provide: SEMANTIC_INDEX, useClass: LocalEmbedder }],
  exports: [SEMANTIC_INDEX],
})
export class SemanticModule {}
