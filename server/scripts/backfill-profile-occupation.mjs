/**
 * Điền `occupationCode` cho những hồ sơ có trước khi lượt quét gom theo ngành.
 *
 * Dùng đúng `profileOccupation` của app (bản đã build trong `dist/`) chứ không
 * chép lại logic: bản chép sẽ lệch ngay lần đầu ai đó sửa danh mục ngành.
 * Hồ sơ chưa đủ dữ liệu để suy thì để `null` - cố ý, xem docblock của hàm đó.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { profileOccupation } from '../dist/modules/profile/occupation.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const profiles = await prisma.profile.findMany({
  select: { userId: true, headline: true, primarySkills: true },
});

const CHUA_SUY_DUOC = '(chưa suy được)';
const tally = new Map();
let filled = 0;

for (const profile of profiles) {
  const occupationCode = profileOccupation(profile);

  await prisma.profile.update({
    where: { userId: profile.userId },
    data: { occupationCode },
  });

  const key = occupationCode ?? CHUA_SUY_DUOC;
  tally.set(key, (tally.get(key) ?? 0) + 1);
  if (occupationCode) filled += 1;
}

console.log(`Đã tính ngành cho ${profiles.length} hồ sơ, ${filled} hồ sơ có ngành.\n`);
for (const [code, count] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${code.padEnd(20)} ${count}`);
}
// Hồ sơ chưa suy được ngành KHÔNG thành cụm, nên không tính vào số từ khoá.
const clusters = [...tally.keys()].filter((key) => key !== CHUA_SUY_DUOC).length;
console.log(
  `\n${clusters} cụm — đây chính là số từ khoá tối đa mà lượt quét đêm sẽ dùng.`,
);

await prisma.$disconnect();
