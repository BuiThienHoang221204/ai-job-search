import 'dotenv/config';
import { execSync } from 'node:child_process';
// Import KHÔNG có đuôi .js, khác với mọi chỗ còn lại trong repo: jest nạp
// globalSetup ở tiến trình chính, ngoài môi trường test, nên `moduleNameMapper`
// (thứ dịch đuôi .js sang đường dẫn thật) không được áp dụng ở đây.
import { ensureTestDatabase, testDatabaseUrl } from './test-database';

/// Chuẩn bị database test MỘT lần trước toàn bộ e2e.
///
/// Dùng `migrate deploy` chứ không `migrate dev`: deploy chỉ áp các migration đã
/// có sẵn, không sinh migration mới và không hỏi gì. Sinh migration từ một lượt
/// chạy test là chuyện không bao giờ nên xảy ra.
///
/// Truyền `DATABASE_URL` qua env của tiến trình con thay vì đặt trên toàn bộ
/// tiến trình cha: nhờ vậy không có đường nào để lệnh này chạm vào database phát
/// triển, kể cả khi ai đó về sau thêm code phía dưới.
export default async function globalSetup(): Promise<void> {
  const url = testDatabaseUrl();
  await ensureTestDatabase(url);

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
