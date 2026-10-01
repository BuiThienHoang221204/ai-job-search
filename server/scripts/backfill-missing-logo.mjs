/**
 * Lấy lại logo công ty cho tin đã crawl TRƯỚC KHI sửa bug lazy-load ở JobOKO.
 *
 * JobOKO lazy-load phần lớn ảnh thẻ (`<img class="lazy" src="data:...base64,"
 * data-lazy="URL_THẬT">`) — regex cũ của scraper đòi `<img src="...">` ngay
 * sau `<div class="item-logo">` nên không khớp gì với thẻ lazy, lưu
 * `companyLogo: null` cho ~86% tin JobOKO. Sửa 2026-10-01 trong
 * `.agents/skills/joboko-search/cli/src/helpers.ts`; script này chỉ backfill
 * DỮ LIỆU CŨ đã lưu trước đó — lượt quét sau tự đúng, không cần chạy lại.
 *
 * Lấy logo qua lệnh `detail` (JSON-LD `hiringOrganization.logo`) — nguồn
 * khác hẳn card lazy-load nên không dính bug cũ; đã đối chiếu fixture thật.
 *
 * Cờ:
 *   --dry-run   chỉ liệt kê, không ghi gì
 *   --source X  mặc định joboko, đổi được để dùng lại cho nguồn khác
 */
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const run = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const sourceArg = argv[argv.indexOf('--source') + 1];
const SOURCE = sourceArg && !sourceArg.startsWith('--') ? sourceArg : 'joboko';

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

/** Nhịp riêng của portal (`delayMs` trong frontmatter SKILL.md) — script đứng NGOÀI `PortalCliService.pace()` nên phải tự đọc và tự giữ, không đi nhanh hơn lượt quét thật. */
function delayMsFor(source) {
  const skillFile = join(REPO_ROOT, '.agents', 'skills', `${source}-search`, 'SKILL.md');
  if (!existsSync(skillFile)) return 3_000;
  const { data } = matter(readFileSync(skillFile, 'utf8'));
  return typeof data.delayMs === 'number' && Number.isInteger(data.delayMs) && data.delayMs > 0
    ? data.delayMs
    : 3_000;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Logo đọc qua lệnh `detail` của portal. */
async function fetchLogo(source, url) {
  const path = cliPath(source);
  if (!path) throw new Error(`không có CLI cho nguồn ${source}`);

  const { stdout } = await run('bun', ['run', path, 'detail', url, '--format', 'json'], {
    cwd: REPO_ROOT,
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  return JSON.parse(stdout).companyLogo ?? null;
}

const jobs = await prisma.job.findMany({
  where: { source: SOURCE, companyLogo: null },
  select: { id: true, source: true, url: true, title: true },
});

console.log(`${jobs.length} tin nguồn ${SOURCE} đang thiếu logo`);

const delayMs = delayMsFor(SOURCE);
console.log(`Nhịp ${delayMs}ms/lượt (đọc từ .agents/skills/${SOURCE}-search/SKILL.md)`);

let fixed = 0;
let stillMissing = 0;
let expired = 0;
let failed = 0;

for (const job of jobs) {
  if (dryRun) {
    console.log(`  [thử] ${job.title}`);
    continue;
  }

  try {
    const companyLogo = await fetchLogo(job.source, job.url);
    await sleep(delayMs);

    if (!companyLogo) {
      stillMissing += 1;
      console.log(`  [vẫn thiếu] ${job.title} — trang chi tiết cũng không có logo`);
      continue;
    }

    await prisma.job.update({ where: { id: job.id }, data: { companyLogo } });
    fixed += 1;
    console.log(`  [sửa] ${job.title} -> ${companyLogo}`);
  } catch (error) {
    const message = (error?.stderr || error?.message || String(error)).toString();

    if (/hết hạn nộp hồ sơ/.test(message)) {
      expired += 1;
      console.log(`  [hết hạn] ${job.title}`);
      continue;
    }
    if (/BLOCKED|trang chống bot/.test(message)) {
      console.log(
        `  [BLOCKED] ${job.source} báo trang chống bot — dừng lại, đừng cố gọi tiếp. Chạy lại script này sau.`,
      );
      break;
    }

    failed += 1;
    console.log(`  [lỗi] ${job.title}: ${message.slice(0, 200)}`);
    await sleep(delayMs);
  }
}

if (!dryRun) {
  console.log(
    `\nXong: ${fixed} sửa được, ${stillMissing} nguồn cũng không có logo, ${expired} tin đã hết hạn, ${failed} lỗi khác — trên tổng ${jobs.length} tin.`,
  );
}

await prisma.$disconnect();
