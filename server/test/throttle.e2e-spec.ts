import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

/// Rate limiting, kiểm với guard THẬT.
///
/// Mọi spec khác tắt throttler đi (xem `TestAppOptions.throttle`), vì gần như
/// test nào cũng gọi `signUp` và sẽ đụng trần 10 lần/phút. Tệp này tồn tại để
/// việc tắt đó không biến thành "chưa bao giờ kiểm": nếu ai lỡ gỡ
/// `ThrottlerGuard` khỏi `CommonModule`, đây là chỗ đỏ lên.
describe('Rate limiting', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ throttle: true });
  });

  afterAll(async () => {
    await harness.close();
  });

  /// Bộ đếm của throttler nằm trong bộ nhớ của tiến trình và tính theo từng
  /// handler, nên hai khối dưới đây không ảnh hưởng nhau. Nhưng chúng KHÔNG tự
  /// reset giữa các test, nên mỗi trần chỉ kiểm được một lần trong tệp này.
  test('đăng nhập sai quá nhiều lần thì bị chặn bằng 429', async () => {
    const attempt = () =>
      request(harness.server)
        .post('/api/auth/login')
        .send({ email: 'khong-ton-tai@test.local', password: 'saibetnhe' });

    // Trần là 10/phút. Mười lần đầu phải là 401 - sai mật khẩu, chưa bị chặn.
    for (let i = 0; i < 10; i += 1) {
      const response = await attempt();
      expect(response.status).toBe(401);
    }

    // Lần thứ 11 bị guard chặn TRƯỚC khi tới handler, nên không tốn thêm một
    // lượt băm bcrypt nào - đó mới là điều đáng giá ở đây.
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
  });

  /// Trần này chặt hơn hẳn (3 lượt mỗi GIỜ) vì thứ phải bảo vệ không phải máy
  /// chủ của mình mà là uy tín IP của nó ở phía portal.
  test('quét portal quá 3 lượt mỗi giờ thì bị chặn', async () => {
    const user = await harness.signUp();
    const start = () =>
      request(harness.server)
        .post('/api/scrape')
        .set('Authorization', `Bearer ${user.token}`)
        .send({});

    for (let i = 0; i < 3; i += 1) {
      const response = await start();
      // Không khẳng định 201: lượt quét có thành công hay không phụ thuộc portal
      // nào đang đăng ký. Điều cần khẳng định là nó CHƯA bị chặn.
      expect(response.status).not.toBe(429);
    }

    const blocked = await start();
    expect(blocked.status).toBe(429);
  });

  /// Probe phải nằm ngoài mọi trần: orchestrator hỏi đều đặn từ MỘT địa chỉ, nên
  /// nó là thứ đầu tiên chạm trần theo IP. Một probe bị 429 trông y hệt một probe
  /// hỏng, và orchestrator sẽ khởi động lại container hoàn toàn khoẻ mạnh.
  test('health probe không bao giờ bị chặn', async () => {
    for (let i = 0; i < 30; i += 1) {
      await request(harness.server).get('/api/health').expect(200);
    }
  });
});
