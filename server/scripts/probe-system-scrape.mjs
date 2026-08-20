/**
 * Nghiệm thu lượt quét của HỆ THỐNG mà không chạm vào dữ liệu.
 *
 * Chạy đúng ba mảnh mà app dùng — `clusterProfiles`, thứ tự xoay vòng, và
 * `collectCards` — trên portal thật, rồi in ra truy vấn nào được gửi và mỗi
 * ngành mang về bao nhiêu tin.
 *
 * KHÔNG ghi database, KHÔNG xếp hàng, KHÔNG gọi model. Nhờ vậy kiểm được phần
 * đã sửa mà không đốt hạn mức và không phải dừng server đang chạy.
 *
 * Dùng: node scripts/probe-system-scrape.mjs [portal]
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { collectCards } from '../dist/modules/scraper/ingest/collect-cards.js';
import { clusterProfiles, clusterQuery } from '../dist/modules/scraper/planning/query-plan.js';
import { PortalCliService } from '../dist/modules/scraper/sources/portal-cli.service.js';
import { resolveOccupation } from '../dist/modules/jobs/taxonomy/resolve.js';
import { MIN_COMPLETION_TO_SCORE } from '../dist/modules/scraper/fan-out.js';

const portal = process.argv[2] ?? 'itviec';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
}

const limits = {
  defaultLocation: process.env.SCRAPER_DEFAULT_LOCATION ?? 'Vietnam',
  maxJobsPerPortal: parseInt(process.env.SCRAPER_MAX_JOBS_PER_PORTAL ?? '50', 10),
  maxAgeDays: parseInt(process.env.SCRAPER_MAX_AGE_DAYS ?? '7', 10),
  maxPages: parseInt(process.env.SCRAPER_MAX_PAGES ?? '5', 10),
  requirePostedAt: process.env.SCRAPER_REQUIRE_POSTED_AT === 'true',
};
const systemQueryLimit = parseInt(process.env.SCRAPER_SYSTEM_QUERY_LIMIT ?? '10', 10);

/** Cấu hình tối thiểu mà PortalCliService đọc tới. */
const config = {
  get: (key) =>
    ({
      'scraper.portalsDir': process.env.PORTALS_DIR ?? '../.agents/skills',
      'scraper.timeoutMs': parseInt(process.env.SCRAPER_TIMEOUT_MS ?? '60000', 10),
      'scraper.portalDelayMs': parseInt(process.env.SCRAPER_PORTAL_DELAY_MS ?? '3000', 10),
    })[key],
};

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const portals = new PortalCliService(config);
await portals.onModuleInit();

const profiles = await prisma.profile.findMany({
  where: { completion: { gte: MIN_COMPLETION_TO_SCORE } },
  select: { headline: true, primarySkills: true, occupationCode: true },
});

const clusters = clusterProfiles(profiles);
const marks = await prisma.occupationCrawl.findMany({
  where: { portal, occupationCode: { in: clusters.map((c) => c.occupationCode) } },
  select: { occupationCode: true, lastCrawledAt: true },
});
const crawledAt = new Map(marks.map((m) => [m.occupationCode, m.lastCrawledAt.getTime()]));

const picked = [...clusters]
  .sort(
    (a, b) =>
      (crawledAt.get(a.occupationCode) ?? 0) - (crawledAt.get(b.occupationCode) ?? 0) ||
      b.size - a.size,
  )
  .slice(0, systemQueryLimit);

console.log(`Portal: ${portal} · trần ${limits.maxJobsPerPortal} tin · ${systemQueryLimit} suất truy vấn`);
console.log(`${profiles.length} hồ sơ -> ${clusters.length} cụm ngành, chọn ${picked.length}:\n`);
for (const c of picked) {
  const seen = crawledAt.has(c.occupationCode)
    ? new Date(crawledAt.get(c.occupationCode)).toISOString().slice(0, 16).replace('T', ' ')
    : 'chưa từng quét';
  console.log(`  ${c.occupationCode.padEnd(15)} "${c.query}"  (${c.size} hồ sơ · ${seen})`);
}

console.log('\n--- gửi truy vấn ---');
const searched = [];
const cards = await collectCards(
  {
    search: (p, args) => {
      searched.push(args.query);
      return portals.search(p, args);
    },
    log: (message) => console.log('  ' + message),
    limits,
  },
  portal,
  picked.map(clusterQuery),
);

console.log('\n--- kết quả ---');
console.log(`${cards.length} tin lấy về từ ${new Set(searched).size}/${picked.length} truy vấn\n`);

const byOccupation = new Map();
for (const card of cards) {
  const code = resolveOccupation(card.title, card.tags);
  byOccupation.set(code, (byOccupation.get(code) ?? 0) + 1);
}
console.log('Ngành của các tin lấy về:');
for (const [code, count] of [...byOccupation].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${code.padEnd(15)} ${count}`);
}

const missed = picked.map((c) => c.query).filter((q) => !searched.includes(q));
if (missed.length) {
  console.log(`\nKHÔNG được gửi: ${missed.join(', ')}`);
} else {
  console.log('\nMọi truy vấn trong kế hoạch đều đã được gửi.');
}

await prisma.$disconnect();
