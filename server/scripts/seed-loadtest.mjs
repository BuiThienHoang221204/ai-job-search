/**
 * Bơm tin tuyển dụng GIẢ vào database để load test có khối lượng thật.
 *
 * Vì sao cần: load test trên database gần rỗng cho ra con số đẹp mà vô nghĩa -
 * Postgres quét toàn bảng 234 dòng nhanh hơn dùng index, nên mọi index tổ hợp
 * trong schema đều không được kiểm. Chỉ ở khối lượng thật mới lộ ra chỗ vỡ.
 *
 * Mọi bản ghi mang `source = 'loadtest'` để xoá sạch bằng MỘT lệnh. In kèm lệnh
 * đó ở cuối, vì dữ liệu này sẽ lẫn vào danh sách việc trên giao diện.
 *
 * Dùng:  node scripts/seed-loadtest.mjs [số tin]     (mặc định 20000)
 * Xoá:   node scripts/seed-loadtest.mjs --clean
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { OCCUPATIONS } from '../dist/modules/jobs/taxonomy/occupations.js';
import { PROVINCES } from '../dist/modules/jobs/taxonomy/provinces.js';

const SOURCE = 'loadtest';
const CHUNK = 1_000;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const TITLES = [
  'Backend Developer', 'Frontend Developer', 'Kế toán tổng hợp',
  'Điều dưỡng viên', 'Nhân viên kinh doanh B2B', 'Kỹ sư cơ khí',
  'Nhân viên xuất nhập khẩu', 'Giáo viên tiếng Anh', 'Chuyên viên tuyển dụng',
  'Nhân viên marketing', 'Thu ngân', 'Lái xe giao hàng',
];

const COMPANIES = [
  'Công ty TNHH Alpha', 'Tập đoàn Beta', 'Gamma Solutions',
  'Delta Group', 'Epsilon Việt Nam', 'Zeta Corp',
];

const TAG_POOL = [
  'fulltime', 'remote', 'hybrid', 'onsite', 'senior', 'junior',
  'tiếng anh', 'ca ngày', 'lương thỏa thuận',
];

/**
 * Mô tả phải dài hơn 80 ký tự, nếu không những nhánh coi tin là "thiếu nội
 * dung" sẽ bỏ qua nó và load test đo nhầm một đường ngắn hơn đường thật.
 */
function describe(title, company, index) {
  return [
    `${company} đang tuyển ${title} (bản ghi load test #${index}).`,
    'Mô tả công việc: phối hợp cùng các bộ phận liên quan, chịu trách nhiệm',
    'triển khai công việc chuyên môn hằng ngày và báo cáo kết quả định kỳ.',
    'Yêu cầu: tốt nghiệp cao đẳng trở lên, có kinh nghiệm ở vị trí tương đương,',
    'kỹ năng giao tiếp tốt, chủ động trong công việc.',
    'Quyền lợi: lương thỏa thuận, thưởng theo hiệu quả, đóng bảo hiểm đầy đủ.',
  ].join(' ');
}

function pick(list, index) {
  return list[index % list.length];
}

/** Trải đều `count` tin trong 30 ngày gần nhất, tính từ mốc truyền vào. */
function postedAtFor(index, count, now) {
  const spreadMs = 30 * 24 * 60 * 60 * 1000;
  return new Date(now - Math.floor((index / count) * spreadMs));
}

function buildJob(index, count, now) {
  const title = pick(TITLES, index);
  const company = pick(COMPANIES, index * 7);
  const occupation = pick(OCCUPATIONS, index * 3);
  const province = pick(PROVINCES, index * 5);
  const postedAt = postedAtFor(index, count, now);

  return {
    source: SOURCE,
    externalId: `lt-${index}`,
    url: `https://example.invalid/loadtest/${index}`,
    title,
    company,
    location: province.name,
    provinceCode: province.code,
    occupationCode: occupation.code,
    searchText: `${title} ${company} ${province.name}`.toLowerCase(),
    tags: [pick(TAG_POOL, index), pick(TAG_POOL, index * 2)],
    description: describe(title, company, index),
    salaryMin: 8_000_000 + (index % 20) * 1_000_000,
    salaryMax: 15_000_000 + (index % 30) * 1_000_000,
    currency: 'VND',
    postedAt,
    scrapedAt: postedAt,
  };
}

async function clean() {
  const { count } = await prisma.job.deleteMany({ where: { source: SOURCE } });
  console.log(`Đã xoá ${count} tin load test.`);
}

async function seed(total) {
  const existing = await prisma.job.count({ where: { source: SOURCE } });
  if (existing > 0) {
    console.log(`Đang có sẵn ${existing} tin load test. Xoá trước rồi bơm lại.`);
    await clean();
  }

  const now = Date.now();
  let done = 0;

  while (done < total) {
    const size = Math.min(CHUNK, total - done);
    const rows = Array.from({ length: size }, (_, offset) =>
      buildJob(done + offset, total, now),
    );
    await prisma.job.createMany({ data: rows, skipDuplicates: true });
    done += size;
    process.stdout.write(`\r  đã bơm ${done}/${total}`);
  }

  const real = await prisma.job.count({ where: { source: { not: SOURCE } } });
  console.log(`\nXong. ${total} tin load test + ${real} tin thật.`);
  console.log(`Xoá lại bằng: node scripts/seed-loadtest.mjs --clean`);
}

const arg = process.argv[2];

try {
  if (arg === '--clean') {
    await clean();
  } else {
    const total = Number.parseInt(arg ?? '20000', 10);
    if (!Number.isFinite(total) || total <= 0) {
      throw new Error(`Số tin không hợp lệ: "${arg}"`);
    }
    await seed(total);
  }
} finally {
  await prisma.$disconnect();
}
