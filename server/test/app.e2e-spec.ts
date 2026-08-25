import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';
import { databaseName } from './support/test-database.js';

/// Kiểm tra chính BỘ KHUNG, không phải một tính năng nghiệp vụ nào.
///
/// Nếu tệp này đỏ thì mọi e2e khác đỏ theo và lý do sẽ khó đọc, nên nó tồn tại
/// để trả lời gọn một câu: app có dựng được trên database test với các bản giả
/// đúng chỗ hay không.
describe('Bộ khung test tích hợp', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  /// Chốt an toàn quan trọng nhất của cả bộ khung: `reset()` chạy TRUNCATE trên
  /// mọi bảng, nên nếu nó trỏ nhầm vào database phát triển thì test sẽ lặng lẽ
  /// xoá sạch dữ liệu thật.
  test('chạy trên database có hậu tố _test', () => {
    const url = process.env.DATABASE_URL ?? '';
    expect(databaseName(url)).toMatch(/_test$/);
  });

  test('app dựng được và route không tồn tại trả 404 chứ không phải 500', async () => {
    await request(harness.server).get('/api/khong-ton-tai').expect(404);
  });

  /// Prefix `api` nằm ở `bootstrap.ts` dùng chung với `main.ts`. Test này giữ
  /// cho hai bên không lệch: bỏ prefix ở production thì chỗ này đỏ.
  test('đường dẫn không có prefix /api thì không tồn tại', async () => {
    await request(harness.server).get('/auth/me').expect(404);
  });

  test('signUp tạo người dùng thật kèm hồ sơ rỗng', async () => {
    const user = await harness.signUp();

    const profile = await harness.prisma.profile.findUnique({
      where: { userId: user.id },
    });
    expect(profile).not.toBeNull();
  });

  test('reset() xoá sạch dữ liệu giữa hai test', async () => {
    await harness.signUp();
    expect(await harness.prisma.user.count()).toBe(1);

    await harness.reset();
    expect(await harness.prisma.user.count()).toBe(0);
  });

  /// ValidationPipe cũng đến từ `bootstrap.ts`. `forbidNonWhitelisted` nghĩa là
  /// một trường lạ phải bị từ chối, không phải bị bỏ qua im lặng.
  test('ValidationPipe từ chối trường ngoài DTO', async () => {
    await request(harness.server)
      .post('/api/auth/register')
      .send({
        email: 'a@test.local',
        name: 'A',
        password: 'MatKhauTest123!',
        role: 'ADMIN',
      })
      .expect(400);
  });

  test('không có lần gọi model nào xảy ra ngoài ý muốn', async () => {
    await harness.signUp();
    await request(harness.server).get('/api/dashboard').expect(401);

    expect(harness.ai.calls).toHaveLength(0);
  });
});
