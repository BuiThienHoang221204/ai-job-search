/**
 * Lấy lại mô tả đầy đủ cho những tin đã lưu nhầm bản bị portal cắt.
 *
 * API tìm kiếm của VietnamWorks cắt mô tả ở vài trăm ký tự rồi thêm dấu ba
 * chấm, và scraper cũ thấy thẻ đã có mô tả nên không gọi trang chi tiết. Bản
 * cụt vẫn dài hơn ngưỡng 80 ký tự nên không nhánh nào chặn được.
 *
 * Cờ:
 *   --dry-run   chỉ liệt kê, không ghi gì
 *   --source X  giới hạn ở một nguồn
 *   --requeue   xếp hàng rút lại yêu cầu (GỌI MODEL, mặc định tắt)
 */
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const run = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Cùng nhịp với `POLITE_DELAY_MS` của scraper. */
const POLITE_DELAY_MS = 1_200;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const requeue = argv.includes('--requeue');
const onlySource = argv[argv.indexOf('--source') + 1];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Đường dẫn CLI của một portal, suy từ tên nguồn. */
function cliPath(source) {
  const path = join(REPO_ROOT, '.agents', 'skills', `${source}-search`, 'cli', 'src', 'cli.ts');
  return existsSync(path) ? path : null;
}

/** Mô tả đầy đủ đọc qua lệnh `detail` của portal. */
async function fetchDescription(source, url) {
  const path = cliPath(source);
  if (!path) throw new Error(`không có CLI cho nguồn ${source}`);

  const { stdout } = await run('bun', ['run', path, 'detail', url, '--format', 'json'], {
    cwd: REPO_ROOT,
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  return JSON.parse(stdout).description ?? null;
}

const jobs = await prisma.job.findMany({
  where: {
    OR: [{ description: { endsWith: '...' } }, { description: { endsWith: '…' } }],
    ...(onlySource && !onlySource.startsWith('--') ? { source: onlySource } : {}),
  },
  select: { id: true, source: true, url: true, title: true, description: true },
});

console.log(`${jobs.length} tin đang mang mô tả bị cắt`);

const repaired = [];
let unchanged = 0;
let failed = 0;

for (const job of jobs) {
  const before = job.description.length;

  if (dryRun) {
    console.log(`  [thử] ${job.source} ${before} ký tự — ${job.title}`);
    continue;
  }

  try {
    const description = await fetchDescription(job.source, job.url);
    await sleep(POLITE_DELAY_MS);

    if (!description || description.length <= before) {
      unchanged += 1;
      console.log(`  [giữ] ${job.source} ${before} ký tự — ${job.title}`);
      continue;
    }

    await prisma.job.update({ where: { id: job.id }, data: { description } });
    await prisma.jobRequirement.updateMany({
      where: { jobId: job.id },
      data: { sourceHash: null },
    });

    repaired.push(job.id);
    console.log(`  [sửa] ${job.source} ${before} → ${description.length} ký tự — ${job.title}`);
  } catch (error) {
    failed += 1;
    console.log(`  [lỗi] ${job.source} ${job.title}: ${error.message}`);
  }
}

if (repaired.length && requeue) {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../dist/app.module.js');
  const { QUEUE, QueueService } = await import('../dist/modules/queue/queue.service.js');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const queued = await app.get(QueueService).sendMany(
    QUEUE.EXTRACT_REQUIREMENTS,
    repaired.map((jobId) => ({ jobId })),
  );
  await app.close();
  console.log(`Đã xếp hàng rút lại yêu cầu cho ${queued} tin`);
}

console.log(
  `Xong: sửa ${repaired.length}, giữ nguyên ${unchanged}, lỗi ${failed}` +
    (repaired.length && !requeue
      ? '. Yêu cầu đã rút của những tin này nay là bản cũ — chạy lại với --requeue để rút lại (có gọi model).'
      : ''),
);

await prisma.$disconnect();
