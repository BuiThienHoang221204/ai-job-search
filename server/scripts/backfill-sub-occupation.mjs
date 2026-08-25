import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import {
  resolveOccupation,
  resolveSubOccupation,
} from '../dist/modules/jobs/taxonomy/resolve.js';

const DRY_RUN = process.argv.includes('--dry-run');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const jobs = await prisma.job.findMany({
    where: { duplicateOfId: null },
    select: { id: true, title: true, tags: true, occupationCode: true },
  });

  const updates = [];
  const perGroup = new Map();

  for (const job of jobs) {
    const group = job.occupationCode ?? resolveOccupation(job.title, job.tags);
    const sub = resolveSubOccupation(group, job.title, job.tags);
    if (sub) updates.push({ id: job.id, sub });

    const bucket = perGroup.get(group) ?? new Map();
    bucket.set(sub ?? '(chưa suy được)', (bucket.get(sub ?? '(chưa suy được)') ?? 0) + 1);
    perGroup.set(group, bucket);
  }

  console.log(`${jobs.length} tin · suy được nghề cho ${updates.length}\n`);

  const sorted = [...perGroup.entries()].sort(
    (a, b) =>
      [...b[1].values()].reduce((x, y) => x + y, 0) -
      [...a[1].values()].reduce((x, y) => x + y, 0),
  );

  for (const [group, bucket] of sorted.slice(0, 6)) {
    const total = [...bucket.values()].reduce((x, y) => x + y, 0);
    console.log(`${group} (${total} tin)`);
    for (const [sub, n] of [...bucket.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(n).padStart(4)}  ${sub}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: không ghi gì.');
    return;
  }

  for (const row of updates) {
    await prisma.job.update({
      where: { id: row.id },
      data: { subOccupationCode: row.sub },
    });
  }
  console.log(`\nĐã ghi ${updates.length} tin.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
