import { Module } from '@nestjs/common';
import { LocalEmbedder } from './local.embedder.js';
import { SEMANTIC_INDEX } from './semantic-index.js';

/** `LocalEmbedder` là adapter duy nhất — không cần khoá nào, không gọi mạng. */
@Module({
  providers: [{ provide: SEMANTIC_INDEX, useClass: LocalEmbedder }],
  exports: [SEMANTIC_INDEX],
})
export class SemanticModule {}
