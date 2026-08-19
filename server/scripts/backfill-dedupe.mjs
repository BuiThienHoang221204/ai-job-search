/**
 * Điền `dedupeKey` cho những tin đã có trước khi cơ chế gộp trùng ra đời.
 *
 * Dùng đúng `derivedFields` của app (bản đã build trong `dist/`) chứ không chép
 * lại logic: bản chép sẽ lệch ngay lần đầu ai đó sửa danh mục tỉnh hay ngành.
 * Tương đương `POST /api/admin/jobs/backfill-taxonomy?all=true`, dành cho lúc
 * chưa muốn dựng cả máy chủ lên.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { derivedFields } from '../dist/modules/jobs/taxonomy/derived.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const jobs = await prisma.job.findMany({
  select: { id: true, title: true, company: true, location: true, tags: true },
});

let updated = 0;
for (const job of jobs) {
  await prisma.job.update({
    where: { id: job.id },
    data: derivedFields(job.title, job.company, job.location, job.tags),
  });
  updated += 1;
}

const [total, keyed, duplicates] = await Promise.all([
  prisma.job.count(),
  prisma.job.count({ where: { NOT: { dedupeKey: null } } }),
  prisma.job.count({ where: { NOT: { duplicateOfId: null } } }),
]);

console.log(
  `Đã tính lại ${updated}/${total} tin; ${keyed} tin có khoá gộp, ${duplicates} tin đang bị đánh dấu trùng`,
);
await prisma.$disconnect();
