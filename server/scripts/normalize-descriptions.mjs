/**
 * Dọn khoảng trắng trong mô tả của những tin đã lưu trước khi có
 * `normalizeDescription` ở tầng ingest.
 *
 * Chữa được: dòng trống liên tiếp, khoảng trắng cuối dòng, `\r\n` lẫn lộn.
 *
 * KHÔNG chữa được: tin không còn ký tự xuống dòng nào. Ranh giới đoạn đã bị
 * xoá trước khi ghi vào database (lỗi `stripTags` của CLI LinkedIn), và không
 * có cách nào suy ngược ra chỗ nào từng là một dòng mới. Script chỉ đếm và báo
 * cáo chúng; muốn có mô tả đúng thì phải quét lại.
 *
 * Cờ:
 *   --dry-run   chỉ đếm, không ghi
 *   --source X  giới hạn ở một nguồn
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const sourceAt = argv.indexOf('--source');
const onlySource = sourceAt >= 0 ? argv[sourceAt + 1] : null;

function normalizeDescription(input) {
  if (input === null) return null;

  const cleaned = input
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const rows = await prisma.job.findMany({
  where: onlySource ? { source: onlySource } : {},
  select: { id: true, source: true, description: true },
});

const jobs = rows.filter((row) => typeof row.description === 'string');

const stats = new Map();
const bump = (source, key) => {
  const row = stats.get(source) ?? { doi: 0, giuNguyen: 0, matXuongDong: 0 };
  row[key] += 1;
  stats.set(source, row);
};

let changed = 0;

for (const job of jobs) {
  if (!job.description.includes('\n')) bump(job.source, 'matXuongDong');

  const next = normalizeDescription(job.description);
  if (next === null || next === job.description) {
    bump(job.source, 'giuNguyen');
    continue;
  }

  bump(job.source, 'doi');
  changed += 1;

  if (!dryRun) {
    await prisma.job.update({
      where: { id: job.id },
      data: { description: next },
    });
  }
}

console.log(`Đã xét ${jobs.length} tin${dryRun ? ' (dry-run, không ghi gì)' : ''}`);
console.log('nguồn'.padEnd(20), 'đổi'.padStart(6), 'giữ'.padStart(6), 'mất xuống dòng'.padStart(16));
for (const [source, row] of [...stats].sort((a, b) => b[1].doi - a[1].doi)) {
  console.log(
    source.padEnd(20),
    String(row.doi).padStart(6),
    String(row.giuNguyen).padStart(6),
    String(row.matXuongDong).padStart(16),
  );
}
console.log(`\nTổng cộng ${changed} tin ${dryRun ? 'sẽ được' : 'đã'} sửa.`);

await prisma.$disconnect();
