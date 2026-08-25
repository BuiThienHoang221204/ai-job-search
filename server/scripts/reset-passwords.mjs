import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Client } = pg;

/**
 * Đặt CHUNG một mật khẩu cho mọi tài khoản trong database đang trỏ tới.
 *
 * Có mặt vì mật khẩu của `admin@aijob.local` trôi khỏi giá trị mà bộ test dùng
 * mỗi lần database dev bị seed lại, và triệu chứng của nó — 6 spec Playwright
 * chết ở bước đăng nhập — trông y hệt giao diện bị vỡ.
 *
 *   node scripts/reset-passwords.mjs [mật-khẩu]
 */
const PASSWORD = process.argv[2] ?? 'MatKhauTest123!';

/** Phải khớp `BCRYPT_ROUNDS` trong auth.service.ts, lệch thì đăng nhập vẫn hỏng. */
const ROUNDS = 12;

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
}

/*
 * Script này ghi đè mật khẩu của MỌI người dùng, nên nó từ chối chạy trên bất
 * kỳ máy chủ nào không phải localhost. Một lần chạy nhầm vào database thật là
 * mở cửa cho bất kỳ ai biết mật khẩu dev.
 */
const host = new URL(url).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  throw new Error(
    `Từ chối chạy: DATABASE_URL trỏ tới "${host}", không phải máy cá nhân.`,
  );
}

const client = new Client({ connectionString: url });
await client.connect();

try {
  const hash = await bcrypt.hash(PASSWORD, ROUNDS);
  const { rows } = await client.query(
    'UPDATE users SET "passwordHash" = $1, "updatedAt" = NOW() RETURNING email, role',
    [hash],
  );

  console.log(`Đã đặt lại mật khẩu cho ${rows.length} tài khoản:`);
  for (const row of rows) console.log(`  ${row.role.padEnd(5)} ${row.email}`);
  console.log(`\nMật khẩu chung: ${PASSWORD}`);
} finally {
  await client.end();
}
