import { Module } from '@nestjs/common';
import { LocalEmbedder } from './local.embedder.js';
import { SEMANTIC_INDEX } from './semantic-index.js';

/**
 * `LocalEmbedder` là adapter mặc định vì nó không cần khoá nào. `GeminiEmbedder`
 * vẫn giữ trong cây mã cho trường hợp muốn đẩy việc embedding ra ngoài tiến
 * trình — đổi adapter là đổi đúng dòng `useClass` dưới đây.
 */
@Module({
  providers: [{ provide: SEMANTIC_INDEX, useClass: LocalEmbedder }],
  exports: [SEMANTIC_INDEX],
})
export class SemanticModule {}
