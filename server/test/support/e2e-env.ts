import 'dotenv/config';
import { testDatabaseUrl } from './test-database.js';

/// Biến môi trường cho test tích hợp, đặt trước khi Nest dựng bất kỳ provider
/// nào.
///
/// Chạy qua `setupFiles` (không phải `setupFilesAfterEach`) là bắt buộc:
/// `PrismaService` và `QueueService` đọc `process.env.DATABASE_URL` ngay trong
/// constructor, nên nếu đặt muộn hơn thì chúng đã kết nối vào database phát
/// triển trước khi test kịp can thiệp.

// Trỏ mọi thứ vào database test. `testDatabaseUrl()` sẽ ném lỗi nếu tên database
// không kết thúc bằng "_test".
process.env.DATABASE_URL = testDatabaseUrl();

// Cron quét portal mặc định BẬT (`configuration.ts` đọc `!== 'false'`). Không
// tắt thì mỗi lần chạy test là một lượt gọi thật ra ITviec/TopCV/VietnamWorks -
// vừa chậm, vừa là cách nhanh nhất để bị chặn IP.
process.env.SCRAPE_CRON_ENABLED = 'false';

// Kiểm tra model chạy ngay lúc app khởi động: quét `/models` thật của các lõi rồi
// probe từng model. Không tắt thì mỗi lần dựng app trong e2e là một loạt request
// mạng thật, và stub `ai` ném lỗi làm mọi model trong bể thành "trượt probe".
process.env.AI_HEALTHCHECK_ENABLED = 'false';

// Cron nhặt việc rơi cũng phải tắt. Nó chạy 10 phút một lần và sẽ xếp lại việc mà
// một test khác đang dựng dở, làm số lượt gọi model không còn đoán được - đúng
// kiểu test chập chờn mà không ai tìm ra nguyên nhân.
process.env.RECONCILE_CRON_ENABLED = 'false';

// Không có khoá VAPID thì cron nhắc học không chạy và `web-push` không bao giờ
// gửi thật. `.env` máy dev có khoá thì test sẽ đẩy thông báo tới trình duyệt thật.
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';

// In PDF phải đi qua `FakeSandbox` của harness. `.env` máy dev hay đặt
// `PDF_SERVICE_URL` trỏ container, và khi đó test gọi mạng thật.
process.env.PDF_SERVICE_URL = '';

// JwtModule cần khoá để ký. Bộ khung không đi qua `main.ts` nên không có bước
// kiểm tra JWT_SECRET ở đó; đặt sẵn một khoá test nếu môi trường chưa có.
process.env.JWT_SECRET ??= 'khoa-chi-danh-cho-test-khong-dung-o-dau-khac';

// Cookie chỉ bật cờ `secure` ở production. Giữ 'test' để supertest (chạy trên
// http) vẫn nhận được cookie.
process.env.NODE_ENV = 'test';
