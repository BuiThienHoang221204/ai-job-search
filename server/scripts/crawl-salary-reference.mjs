/**
 * Nạp bảng lương tham chiếu của x-interview.com vào `salary_references`.
 *
 * Hai pha TÁCH RỜI vì lý do thực dụng: parser gần như chắc chắn sai ở lần đầu, và
 * sửa parser thì chỉ chạy lại `--parse` trên HTML đã lưu chứ không đánh lại máy chủ
 * của họ lần thứ hai.
 *
 * Bản ghi nạp vào luôn ở `visibility = INTERNAL`. Việc lật sang PUBLIC là một câu
 * SQL có chủ đích ở bước sau, không phải hệ quả của việc chạy script này.
 */
import 'dotenv/config';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://x-interview.com';
const INDEX = `${BASE}/mypage/salary`;
const UA = 'Careelot-SalaryResearch/1.0 (thesis research; low-rate, cached)';
const DELAY_MS = 1500;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.cache', 'x-interview');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function slugsFrom(html) {
  const found = new Set();
  const re = /href="https:\/\/x-interview\.com\/mypage\/salary\/([a-z0-9-]+)\/([a-z0-9-]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) found.add(`${m[1]}/${m[2]}`);
  return [...found].sort();
}

async function fetchAll() {
  await mkdir(CACHE, { recursive: true });
  const index = await get(INDEX);
  await writeFile(path.join(CACHE, '_index.html'), index, 'utf8');

  const slugs = slugsFrom(index);
  console.log(`Tìm thấy ${slugs.length} vị trí trên trang index.`);

  let fetched = 0;
  let skipped = 0;
  for (const slug of slugs) {
    const file = path.join(CACHE, `${slug.replace('/', '__')}.html`);
    if (existsSync(file)) {
      skipped += 1;
      continue;
    }
    await sleep(DELAY_MS);
    try {
      await writeFile(file, await get(`${BASE}/mypage/salary/${slug}`), 'utf8');
      fetched += 1;
      if (fetched % 20 === 0) console.log(`  ... đã tải ${fetched}`);
    } catch (err) {
      console.error(`  LỖI ${slug}: ${err.message}`);
    }
  }
  console.log(`Xong: tải mới ${fetched}, bỏ qua ${skipped} (đã có trong cache).`);
}

const stripTags = (s) => s.replace(/<[^>]+>/g, '\n');
const squash = (s) => s.replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

/** "27,3M" -> 27300000. Dấu phẩy là thập phân kiểu Việt, "M" là triệu. */
function amount(token) {
  const m = /^([\d.]+(?:,\d+)?)\s*M$/i.exec(token.trim());
  if (!m) return null;
  return Math.round(Number(m[1].replace(/\./g, '').replace(',', '.')) * 1_000_000);
}

const BUCKETS = ['Dưới 1 năm', '1–3 năm', '3–5 năm', 'Trên 5 năm'];

function parsePage(html, slug) {
  const lines = squash(stripTags(html)).split('\n').map((s) => s.trim()).filter(Boolean);

  const at = (label) => lines.findIndex((l) => l === label);
  const positionName = (lines.find((l) => l.startsWith('Mức lương ')) ?? '').replace('Mức lương ', '').trim();

  const avgAt = at('Lương trung bình');
  const rangeAt = at('Khoảng lương phổ biến');

  const avgMonthly = avgAt >= 0 ? amount(lines[avgAt + 1] ?? '') : null;

  let rangeMin = null;
  let rangeMax = null;
  if (rangeAt >= 0) {
    const parts = (lines[rangeAt + 1] ?? '').split('-');
    if (parts.length === 2) {
      rangeMin = amount(parts[0]);
      rangeMax = amount(parts[1]);
    }
  }

  const bands = [];
  for (const label of BUCKETS) {
    const i = lines.indexOf(label);
    if (i < 0) continue;
    const [min, avg, max] = [1, 2, 3].map((k) => amount((lines[i + k] ?? '').replace(/\s*VND$/i, '')));
    if (min === null && avg === null && max === null) continue;
    bands.push({ experienceLabel: label, minAmount: min, avgAmount: avg, maxAmount: max });
  }

  const [industrySlug, positionSlug] = slug.split('/');
  return {
    source: 'x-interview',
    sourceUrl: `${BASE}/mypage/salary/${slug}`,
    industrySlug,
    positionSlug,
    positionName: positionName || positionSlug,
    avgMonthly,
    rangeMin,
    rangeMax,
    bands,
  };
}

async function parseAll() {
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { PrismaClient } = await import('../dist/generated/prisma/client.js');
  const { referenceOccupation } = await import('../dist/modules/salary/reference-map.js');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const files = (await readdir(CACHE)).filter((f) => f.endsWith('.html') && !f.startsWith('_'));
  const fetchedAt = new Date();
  let written = 0;
  let mapped = 0;
  const broken = [];

  for (const file of files) {
    const slug = file.replace(/\.html$/, '').replace('__', '/');
    const parsed = parsePage(await readFile(path.join(CACHE, file), 'utf8'), slug);

    if (parsed.avgMonthly === null && parsed.rangeMin === null) {
      broken.push(slug);
      continue;
    }

    const occupationCode = referenceOccupation(parsed.positionSlug, parsed.industrySlug);
    if (occupationCode) mapped += 1;

    const { bands, ...head } = parsed;
    const row = await prisma.salaryReference.upsert({
      where: { source_positionSlug: { source: head.source, positionSlug: head.positionSlug } },
      create: { ...head, occupationCode, fetchedAt },
      update: { ...head, occupationCode, fetchedAt },
    });

    await prisma.salaryReferenceBand.deleteMany({ where: { referenceId: row.id } });
    if (bands.length > 0) {
      await prisma.salaryReferenceBand.createMany({
        data: bands.map((b) => ({ ...b, referenceId: row.id })),
      });
    }
    written += 1;
  }

  console.log(`Ghi ${written}/${files.length} vị trí; ${mapped} map được sang occupationCode.`);
  if (broken.length > 0) console.log(`KHÔNG parse được ${broken.length}: ${broken.slice(0, 10).join(', ')}`);
  await prisma.$disconnect();
}

const args = process.argv.slice(2);
const doFetch = args.length === 0 || args.includes('--fetch');
const doParse = args.length === 0 || args.includes('--parse');

if (doFetch) await fetchAll();
if (doParse) await parseAll();
