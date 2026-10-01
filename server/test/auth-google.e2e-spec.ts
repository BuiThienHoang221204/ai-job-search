import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

// Trọng tâm: ba đường một email Google có thể đi, và chữ ký token KHÔNG tự
// chứng minh được quyền sở hữu - chỉ `GoogleAuthService.verify` (ở đây là bản
// giả) mới quyết định idToken "hợp lệ" ứng với profile nào.
describe('POST /api/auth/google', () => {
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

  const google = (idToken: string) =>
    request(harness.server).post('/api/auth/google').send({ idToken });

  test('token không khớp profile nào trả 401', async () => {
    await google('token-khong-ton-tai').expect(401);
  });

  test('tạo tài khoản mới khi email chưa từng đăng ký', async () => {
    harness.google.willReturn('tok-moi', {
      googleId: 'google-sub-1',
      email: 'moi@test.local',
      name: 'Người Mới',
    });

    const response = await google('tok-moi').expect(200);
    const body = response.body as { user: { email: string; name: string } };

    expect(body.user.email).toBe('moi@test.local');
    expect(body.user.name).toBe('Người Mới');

    const user = await harness.prisma.user.findUnique({
      where: { email: 'moi@test.local' },
    });
    expect(user?.googleId).toBe('google-sub-1');
    // Tài khoản chỉ đăng nhập Google thì không có mật khẩu nào để băm.
    expect(user?.passwordHash).toBeNull();
  });

  test('cùng googleId đăng nhập lại trả về đúng user cũ, không tạo thêm', async () => {
    harness.google.willReturn('tok-a', {
      googleId: 'google-sub-2',
      email: 'quay-lai@test.local',
      name: 'Quay Lại',
    });
    const first = await google('tok-a').expect(200);
    const second = await google('tok-a').expect(200);

    const firstBody = first.body as { user: { id: string } };
    const secondBody = second.body as { user: { id: string } };
    expect(secondBody.user.id).toBe(firstBody.user.id);

    expect(
      await harness.prisma.user.count({
        where: { email: 'quay-lai@test.local' },
      }),
    ).toBe(1);
  });

  test('email trùng tài khoản mật khẩu có sẵn thì tự liên kết, không tạo tài khoản mới', async () => {
    const existing = await harness.signUp('da-co-mat-khau@test.local');

    harness.google.willReturn('tok-link', {
      googleId: 'google-sub-3',
      email: existing.email,
      name: 'Tên Từ Google',
    });

    const response = await google('tok-link').expect(200);
    const body = response.body as { user: { id: string } };
    expect(body.user.id).toBe(existing.id);

    const user = await harness.prisma.user.findUnique({
      where: { id: existing.id },
    });
    expect(user?.googleId).toBe('google-sub-3');
    // Liên kết KHÔNG được xoá mật khẩu cũ - người dùng vẫn đăng nhập được bằng mật khẩu như trước.
    expect(user?.passwordHash).not.toBeNull();

    await request(harness.server)
      .post('/api/auth/login')
      .send({ email: existing.email, password: existing.password })
      .expect(200);
  });

  test('đặt đủ hai cookie giống đăng nhập thường', async () => {
    harness.google.willReturn('tok-cookie', {
      googleId: 'google-sub-4',
      email: 'cookie@test.local',
      name: 'Cookie Test',
    });

    const response = await google('tok-cookie').expect(200);
    const raw: unknown = response.headers['set-cookie'];
    const cookies: string[] = Array.isArray(raw)
      ? raw.filter((value): value is string => typeof value === 'string')
      : typeof raw === 'string'
        ? [raw]
        : [];
    const names = cookies.map((value) => value.split('=')[0]);

    expect(names).toEqual(
      expect.arrayContaining(['aijob_token', 'aijob_refresh']),
    );
  });
});
