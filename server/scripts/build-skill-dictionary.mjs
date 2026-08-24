/**
 * Dựng danh bạ kỹ năng cho toàn bộ kho, chạy tay từng lô.
 *
 * Cùng một service với hàng đợi `skill.canonicalize` — script này chỉ khác ở
 * chỗ nó điều khiển vòng lặp, để chạy được vài lô rồi dừng khi thử nghiệm.
 *
 * Chạy với `APP_ROLE=api` để tiến trình KHÔNG khởi động worker và cron: nếu
 * không, nó vừa dựng danh bạ vừa tiêu thụ mọi hàng đợi khác của hệ thống.
 *
 * Cờ:
 *   --rounds N   số lô tối đa (mặc định chạy tới hết)
 */
process.env.APP_ROLE = 'api';

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { SkillDictionaryService } from '../dist/modules/matching/services/skill-dictionary.service.js';

const at = process.argv.indexOf('--rounds');
const MAX_ROUNDS = at >= 0 ? Number(process.argv[at + 1]) : Infinity;
const BATCH = 20;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const dictionary = app.get(SkillDictionaryService);

  const terms = await dictionary.allTerms();
  console.log(`${terms.length} lượt nhắc kỹ năng trong kho\n`);

  let round = 0;
  let total = 0;
  for (;;) {
    if (round >= MAX_ROUNDS) {
      console.log(`\nDừng ở giới hạn --rounds ${MAX_ROUNDS}.`);
      break;
    }

    const startedAt = Date.now();
    const { added, remaining } = await dictionary.ingest(terms, BATCH);
    total += added;
    round += 1;

    console.log(
      `lô ${round}: thêm ${added}, còn ${remaining} (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`,
    );

    if (remaining === 0) {
      console.log('\nHết cách viết chưa biết.');
      break;
    }
    if (added === 0) {
      console.log('\nLô này không ghi được gì — nhiều khả năng hết hạn mức.');
      break;
    }
  }

  console.log(`Tổng cộng thêm ${total} cách viết sau ${round} lô.`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
