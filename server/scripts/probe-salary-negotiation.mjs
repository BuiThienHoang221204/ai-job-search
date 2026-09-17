import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import {
  buildPositionIndex,
  resolveJobPosition,
} from '../dist/modules/salary/job-position.js';
import { negotiationRange } from '../dist/modules/salary/negotiation.js';
import { yearsOfExperience } from '../dist/modules/profile/experience-years.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const pct = (part, whole) =>
  whole === 0 ? '0,0%' : `${((part / whole) * 100).toFixed(1).replace('.', ',')}%`;
const pad = (value, width) => String(value).padEnd(width);
const padStart = (value, width) => String(value).padStart(width);
const million = (value) =>
  value === null || value === undefined
    ? '—'
    : `${(value / 1_000_000).toFixed(1).replace('.', ',')}tr`;

const jobs = await prisma.job.findMany({
  where: { duplicateOfId: null },
  select: {
    id: true,
    title: true,
    occupationCode: true,
    subOccupationCode: true,
    salaryMin: true,
    salaryMax: true,
    requirements: { select: { minYears: true, seniority: true, status: true } },
  },
});

const references = await prisma.salaryReference.findMany({
  where: { visibility: 'PUBLIC' },
  select: {
    positionSlug: true,
    positionName: true,
    occupationCode: true,
    avgMonthly: true,
    rangeMin: true,
    rangeMax: true,
    currency: true,
    bands: {
      select: {
        experienceLabel: true,
        minAmount: true,
        avgAmount: true,
        maxAmount: true,
      },
    },
  },
});

const index = buildPositionIndex(references);

const email = process.argv[2];
const profile = email
  ? await prisma.profile.findFirst({
      where: { user: { email: { contains: email } } },
      select: { experiences: true, currentSalary: true, expectedSalary: true },
    })
  : null;
const candidateYears = profile ? yearsOfExperience(profile.experiences) : null;
if (email) {
  console.log(`
Hồ sơ ${email}: ${candidateYears ?? '(chưa đọc được)'} năm kinh nghiệm, lương hiện tại ${profile?.currentSalary ?? '—'}`);
}

const FIT_SCORES = [null, 20, 50, 85];

const rows = jobs.map((job) => {
  const resolved = resolveJobPosition(job, index);
  const done = job.requirements?.status === 'DONE' ? job.requirements : null;
  const range = resolved
    ? negotiationRange({
        resolved,
        candidateYears,
        minYears: done?.minYears ?? null,
        seniority: done?.seniority ?? 'UNKNOWN',
        fitScore: 50,
        postedMin: job.salaryMin,
        postedMax: job.salaryMax,
        currentSalary: profile?.currentSalary ?? null,
        expectedSalary: profile?.expectedSalary ?? null,
      })
    : null;
  return { job, resolved, range };
});

const counts = { POSITION: 0, SUB_OCCUPATION: 0, NONE: 0 };
let noRange = 0;
for (const row of rows) {
  if (!row.resolved) counts.NONE += 1;
  else counts[row.resolved.basis] += 1;
  if (row.resolved && !row.range) noRange += 1;
}

console.log('\n=== 1. ĐỘ PHỦ THẬT CỦA CODE SẢN PHẨM ===\n');
console.log(`Tổng tin (không trùng)            ${padStart(jobs.length, 8)}`);
console.log(`Khớp đúng vị trí (POSITION)       ${padStart(counts.POSITION, 8)}  ${pct(counts.POSITION, jobs.length)}`);
console.log(`Khớp theo nhóm nghề (SUB)         ${padStart(counts.SUB_OCCUPATION, 8)}  ${pct(counts.SUB_OCCUPATION, jobs.length)}`);
console.log(`Không có dữ liệu (NONE)           ${padStart(counts.NONE, 8)}  ${pct(counts.NONE, jobs.length)}`);
console.log(`CÓ PANEL LƯƠNG                    ${padStart(jobs.length - counts.NONE - noRange, 8)}  ${pct(jobs.length - counts.NONE - noRange, jobs.length)}`);
console.log(`Khớp được nhưng không ra số       ${padStart(noRange, 8)}`);

console.log('\n=== 2. VÌ SAO KHÔNG CÓ DỮ LIỆU ===\n');
const orphan = new Map();
for (const { job, resolved } of rows) {
  if (resolved) continue;
  const key = `${job.occupationCode ?? '(không rõ ngành)'} / ${job.subOccupationCode ?? '(không rõ nghề)'}`;
  orphan.set(key, (orphan.get(key) ?? 0) + 1);
}
for (const [key, count] of [...orphan].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${pad(key, 38)}${padStart(count, 6)} tin`);
}

console.log('\n=== 3. KHOẢNG DEAL THEO ĐỘ KHỚP HỒ SƠ ===\n');
const shown = rows.filter((row) => row.range).slice(0, 10);
console.log(`${pad('Tin', 38)}${pad('Cơ sở', 8)}${pad('Mốc', 12)}${['fit —', 'fit 20', 'fit 50', 'fit 85'].map((h) => padStart(h, 16)).join('')}`);
for (const { job, resolved } of shown) {
  const done = job.requirements?.status === 'DONE' ? job.requirements : null;
  const cells = FIT_SCORES.map((fitScore) => {
    const range = negotiationRange({
      resolved,
      candidateYears,
      minYears: done?.minYears ?? null,
      seniority: done?.seniority ?? 'UNKNOWN',
      fitScore,
      postedMin: job.salaryMin,
      postedMax: job.salaryMax,
      currentSalary: profile?.currentSalary ?? null,
      expectedSalary: profile?.expectedSalary ?? null,
    });
    return padStart(range ? `${million(range.floor)}-${million(range.ceiling)}` : '—', 16);
  });
  const first = negotiationRange({
    resolved,
    candidateYears,
    minYears: done?.minYears ?? null,
    seniority: done?.seniority ?? 'UNKNOWN',
    fitScore: 50,
  });
  console.log(
    `${pad(job.title.slice(0, 36), 38)}${pad(resolved.basis === 'POSITION' ? 'vị trí' : 'nhóm', 8)}${pad(first?.experienceLabel ?? '—', 12)}${cells.join('')}`,
  );
}

console.log('\n=== 4. PHÂN BỐ MỤC TIÊU ===\n');
const targets = rows.filter((row) => row.range).map((row) => row.range.target).sort((a, b) => a - b);
const at = (ratio) => targets[Math.floor(targets.length * ratio)];
console.log(`  thấp nhất  ${million(targets[0])}`);
console.log(`  phân vị 25 ${million(at(0.25))}`);
console.log(`  trung vị   ${million(at(0.5))}`);
console.log(`  phân vị 75 ${million(at(0.75))}`);
console.log(`  cao nhất   ${million(targets[targets.length - 1])}`);

console.log('');
await prisma.$disconnect();
