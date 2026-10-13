/**
 * Lấy nhãn ngành nghề của portal cho những tin lưu TRƯỚC khi scraper biết giữ
 * nhãn, rồi xếp lại ngành bằng nhãn đó.
 *
 * Mặc định chỉ xét tin đang ở `OTHER` - đó là chỗ nhãn đổi được kết quả nhiều
 * nhất, và mỗi tin tốn một request `detail` vào portal. Không gọi model nào.
 *
 * Cờ:
 *   --dry-run   chỉ liệt kê, không ghi gì
 *   --source X  giới hạn ở một nguồn
 *   --all       xét mọi tin chưa có nhãn, không chỉ tin ở OTHER
 *   --limit N   chỉ xử lý N tin đầu (để đo trên mẫu trước khi chạy hết)
 *   --delay N   nghỉ N mili giây giữa hai request (mặc định 8000, bằng nhịp
 *               `delayMs` chậm nhất trong các SKILL.md)
 */
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import {
  resolveOccupation,
  resolveSubOccupation,
} from '../dist/modules/jobs/taxonomy/resolve.js';

const run = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCES = [
  'vietnamworks',
  'careerviet',
  'joboko',
  'itviec',
  'careerlink',
];

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')
    ? argv[index + 1]
    : null;
};
const dryRun = argv.includes('--dry-run');
const all = argv.includes('--all');
const onlySource = flag('--source');
const delayMs = Number(flag('--delay') ?? 8_000);
const limit = flag('--limit') ? Number(flag('--limit')) : undefined;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.',
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function cliPath(source) {
  const path = join(
    REPO_ROOT,
    '.agents',
    'skills',
    `${source}-search`,
    'cli',
    'src',
    'cli.ts',
  );
  return existsSync(path) ? path : null;
}

async function fetchCategories(source, url) {
  const path = cliPath(source);
  if (!path) throw new Error(`không có CLI cho nguồn ${source}`);

  try {
    const { stdout } = await run(
      'bun',
      ['run', path, 'detail', url, '--format', 'json'],
      {
        cwd: REPO_ROOT,
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      },
    );
    const detail = JSON.parse(stdout);
    return Array.isArray(detail?.categories) ? detail.categories : [];
  } catch (error) {
    error.blocked = /"code"\s*:\s*"BLOCKED"/.test(String(error.stderr ?? ''));
    throw error;
  }
}

const jobs = await prisma.job.findMany({
  where: {
    source: onlySource ? onlySource : { in: SOURCES },
    categories: { isEmpty: true },
    ...(all ? {} : { occupationCode: 'OTHER' }),
  },
  orderBy: { scrapedAt: 'desc' },
  take: limit,
  select: {
    id: true,
    source: true,
    url: true,
    title: true,
    tags: true,
    occupationCode: true,
  },
});

console.log(
  `${jobs.length} tin cần lấy nhãn${dryRun ? ' (chạy thử, không ghi)' : ''}`,
);

const moved = {};
let labelled = 0;
let empty = 0;
let failed = 0;

for (const [index, job] of jobs.entries()) {
  if (dryRun) {
    console.log(`  [thử] ${job.source} ${job.occupationCode} — ${job.title}`);
    continue;
  }
  if (index > 0) await sleep(delayMs);

  try {
    const categories = await fetchCategories(job.source, job.url);
    if (!categories.length) {
      empty += 1;
      console.log(`  [không nhãn] ${job.source} — ${job.title}`);
      continue;
    }

    const occupationCode = resolveOccupation(job.title, job.tags, categories);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        categories,
        occupationCode,
        subOccupationCode: resolveSubOccupation(occupationCode, job.title, [
          ...categories,
          ...job.tags,
        ]),
      },
    });

    labelled += 1;
    const key = `${job.occupationCode} -> ${occupationCode}`;
    moved[key] = (moved[key] ?? 0) + 1;
    console.log(
      `  [nhãn] ${job.source} ${key} [${categories.join(' | ')}] — ${job.title}`,
    );
  } catch (error) {
    failed += 1;
    console.log(`  [lỗi] ${job.source} ${job.title}: ${error.message}`);
    if (error.blocked) {
      console.log(`${job.source} đang chặn - dừng để không kéo dài lượt chặn.`);
      break;
    }
  }
}

console.log(
  `Xong: gắn nhãn ${labelled}, không có nhãn ${empty}, lỗi ${failed}`,
);
for (const [key, count] of Object.entries(moved).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count}\t${key}`);
}

await prisma.$disconnect();
