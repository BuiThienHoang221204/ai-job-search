/**
 * Đối chiếu lại toàn bộ kho với danh bạ kỹ năng hiện tại.
 *
 * Chạy sau khi danh bạ dày lên. Cùng một service với hàng đợi
 * `match.requirements`; script chỉ khác ở chỗ gọi thẳng, không qua hàng đợi.
 */
process.env.APP_ROLE = 'api';

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { RequirementMatchService } from '../dist/modules/matching/services/requirement-match.service.js';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const startedAt = Date.now();
  const written = await app.get(RequirementMatchService).scoreAll();
  console.log(
    `Ghi lại ${written} cặp trong ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
  );

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
