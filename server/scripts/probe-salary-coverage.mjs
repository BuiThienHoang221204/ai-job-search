/**
 * Đo xem kho tin có đủ dữ liệu để tự tính bảng lương hay không.
 *
 * Chỉ ĐỌC, không sửa gì. Hai phép đo, và phép giao của chúng mới là con số thật:
 * một tin chỉ vào được thống kê khi vừa parse được lương vừa biết mốc kinh nghiệm.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const pct = (part, whole) => (whole === 0 ? '0,0%' : `${((part / whole) * 100).toFixed(1).replace('.', ',')}%`);
const pad = (s, n) => String(s).padEnd(n);
const padStart = (s, n) => String(s).padStart(n);

const [totals] = await prisma.$queryRaw`
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE "salaryRaw" IS NULL)::int AS no_salary,
    count(*) FILTER (WHERE "salaryRaw" IS NOT NULL AND "salaryRaw" !~ '[0-9]')::int AS text_only,
    count(*) FILTER (WHERE "salaryRaw" ~ '[0-9]')::int AS has_digits
  FROM jobs
  WHERE "duplicateOfId" IS NULL
`;

console.log('\n=== 1. ĐỘ PHỦ LƯƠNG (tin không trùng) ===\n');
console.log(`Tổng tin                    ${padStart(totals.total, 8)}`);
console.log(`Không có salaryRaw          ${padStart(totals.no_salary, 8)}  ${pct(totals.no_salary, totals.total)}`);
console.log(`Có chữ, không có số         ${padStart(totals.text_only, 8)}  ${pct(totals.text_only, totals.total)}   (thoả thuận, cạnh tranh...)`);
console.log(`CÓ SỐ - parse được          ${padStart(totals.has_digits, 8)}  ${pct(totals.has_digits, totals.total)}   <-- con số quyết định`);

const byOccupation = await prisma.$queryRaw`
  SELECT
    coalesce("occupationCode", '(chưa xếp)') AS code,
    count(*)::int AS total,
    count(*) FILTER (WHERE "salaryRaw" ~ '[0-9]')::int AS has_digits
  FROM jobs
  WHERE "duplicateOfId" IS NULL
  GROUP BY 1
  ORDER BY 3 DESC
`;

console.log('\n=== 2. THEO NGÀNH ===\n');
console.log(`${pad('Ngành', 22)}${padStart('Tin', 8)}${padStart('Có số', 8)}${padStart('Tỉ lệ', 9)}`);
for (const row of byOccupation) {
  console.log(`${pad(row.code, 22)}${padStart(row.total, 8)}${padStart(row.has_digits, 8)}${padStart(pct(row.has_digits, row.total), 9)}`);
}

const [reqs] = await prisma.$queryRaw`
  SELECT
    count(*)::int AS extracted,
    count(*) FILTER (WHERE r."minYears" IS NOT NULL)::int AS has_years
  FROM job_requirements r
  JOIN jobs j ON j.id = r."jobId"
  WHERE j."duplicateOfId" IS NULL
`;

console.log('\n=== 3. ĐỘ PHỦ KINH NGHIỆM ===\n');
console.log(`Tin đã rút trích yêu cầu    ${padStart(reqs.extracted, 8)}  ${pct(reqs.extracted, totals.total)} tổng số tin`);
console.log(`Trong đó có minYears        ${padStart(reqs.has_years, 8)}  ${pct(reqs.has_years, reqs.extracted)} số đã rút trích`);

const buckets = await prisma.$queryRaw`
  SELECT
    CASE
      WHEN r."minYears" < 1 THEN 'Dưới 1 năm'
      WHEN r."minYears" < 3 THEN '1-3 năm'
      WHEN r."minYears" < 5 THEN '3-5 năm'
      ELSE 'Từ 5 năm'
    END AS bucket,
    count(*)::int AS n
  FROM job_requirements r
  JOIN jobs j ON j.id = r."jobId"
  WHERE j."duplicateOfId" IS NULL AND r."minYears" IS NOT NULL
  GROUP BY 1
  ORDER BY 1
`;

for (const row of buckets) {
  console.log(`  ${pad(row.bucket, 24)}${padStart(row.n, 8)}`);
}

const [both] = await prisma.$queryRaw`
  SELECT count(*)::int AS n
  FROM jobs j
  LEFT JOIN job_requirements r ON r."jobId" = j.id
  WHERE j."duplicateOfId" IS NULL
    AND j."salaryRaw" ~ '[0-9]'
    AND r."minYears" IS NOT NULL
`;

console.log('\n=== 4. PHÉP GIAO - tin dùng được cho bảng theo kinh nghiệm ===\n');
console.log(`Vừa có lương số vừa có minYears   ${padStart(both.n, 8)}  ${pct(both.n, totals.total)} tổng số tin`);

const usableByOccupation = await prisma.$queryRaw`
  SELECT
    coalesce(j."occupationCode", '(chưa xếp)') AS code,
    count(*)::int AS n
  FROM jobs j
  WHERE j."duplicateOfId" IS NULL AND j."salaryRaw" ~ '[0-9]'
  GROUP BY 1
  HAVING count(*) >= 10
  ORDER BY 2 DESC
`;

console.log('\n=== 5. NGÀNH ĐẠT NGƯỠNG 10 TIN CÓ LƯƠNG ===\n');
if (usableByOccupation.length === 0) {
  console.log('  KHÔNG ngành nào đạt. Bảng lương tự tính sẽ rỗng.');
} else {
  for (const row of usableByOccupation) {
    console.log(`  ${pad(row.code, 22)}${padStart(row.n, 8)}`);
  }
}

const samples = await prisma.$queryRaw`
  SELECT DISTINCT "salaryRaw" AS raw
  FROM jobs
  WHERE "duplicateOfId" IS NULL AND "salaryRaw" ~ '[0-9]'
  LIMIT 40
`;

console.log('\n=== 6. MẪU CHUỖI LƯƠNG - dùng để viết parser ===\n');
for (const row of samples) {
  console.log(`  ${row.raw}`);
}

console.log('');
await prisma.$disconnect();
