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
    request(harness.server)
      .post('/api/auth/google')
      .send({ idToken, acceptTerms: true });

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

  test('email trùng tài khoản mật khẩu có sẵn thì liên kết vào đúng tài khoản đó, không tạo tài khoản mới', async () => {
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
    expect(await harness.prisma.user.count()).toBe(1);
  });

  // Pre-account takeover: kẻ tấn công đăng ký trước bằng email nạn nhân (đăng ký không xác thực email),
  // nạn nhân sau đó đăng nhập Google. Google chứng minh nạn nhân sở hữu email, nên mật khẩu và mọi
  // phiên mở TRƯỚC lúc liên kết đều thuộc về người lạ và phải mất hiệu lực.
  describe('liên kết Google tước quyền của người đăng ký trước bằng mật khẩu', () => {
    const takeOver = async () => {
      const attacker = await harness.signUp('nan-nhan@test.local');
      harness.google.willReturn('tok-victim', {
        googleId: 'google-sub-victim',
        email: attacker.email,
        name: 'Nạn Nhân',
      });
      await google('tok-victim').expect(200);
      return attacker;
    };

    test('mật khẩu kẻ tấn công đặt không còn đăng nhập được', async () => {
      const attacker = await takeOver();

      const user = await harness.prisma.user.findUnique({
        where: { id: attacker.id },
      });
      expect(user?.passwordHash).toBeNull();

      await request(harness.server)
        .post('/api/auth/login')
        .send({ email: attacker.email, password: attacker.password })
        .expect(401);
    });

    test('access token kẻ tấn công đang giữ bị từ chối', async () => {
      const attacker = await takeOver();

      await request(harness.server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${attacker.token}`)
        .expect(401);
    });

    test('refresh token kẻ tấn công đang giữ không gia hạn được phiên', async () => {
      const attacker = await takeOver();

      await request(harness.server)
        .post('/api/auth/refresh')
        .set('Cookie', attacker.refreshCookie)
        .expect(401);
    });

    test('nạn nhân đăng nhập Google lại vẫn vào đúng tài khoản', async () => {
      const attacker = await takeOver();

      const again = await google('tok-victim').expect(200);
      expect((again.body as { user: { id: string } }).user.id).toBe(
        attacker.id,
      );
    });
  });

  test('email chỉ khác hoa/thường vẫn là MỘT tài khoản ở cả đăng ký, đăng nhập và Google', async () => {
    const registered = await request(harness.server)
      .post('/api/auth/register')
      .send({
        email: '  Hoa.Thuong@Test.Local ',
        password: 'MatKhau123!',
        name: 'Hoa Thường',
        acceptTerms: true,
      })
      .expect(201);
    const id = (registered.body as { user: { id: string } }).user.id;

    await request(harness.server)
      .post('/api/auth/register')
      .send({
        email: 'hoa.thuong@test.local',
        password: 'MatKhau456!',
        name: 'Trùng',
        acceptTerms: true,
      })
      .expect(409);

    await request(harness.server)
      .post('/api/auth/login')
      .send({ email: 'HOA.THUONG@test.local', password: 'MatKhau123!' })
      .expect(200);

    harness.google.willReturn('tok-case', {
      googleId: 'google-sub-case',
      email: 'Hoa.Thuong@test.local',
      name: 'Hoa Thường',
    });
    const linked = await google('tok-case').expect(200);
    expect((linked.body as { user: { id: string } }).user.id).toBe(id);
  });

  // Email Workspace có thể được cấp lại cho người mới: Google mới (sub khác, cùng email, đã xác minh)
  // không được giành tài khoản đã gắn với Google cũ.
  test('tài khoản đã gắn Google khác thì KHÔNG bị liên kết đè, trả 409', async () => {
    harness.google.willReturn('tok-cu', {
      googleId: 'google-sub-cu',
      email: 'workspace@test.local',
      name: 'Chủ Cũ',
    });
    const first = await google('tok-cu').expect(200);
    const ownerId = (first.body as { user: { id: string } }).user.id;

    harness.google.willReturn('tok-moi-cung-email', {
      googleId: 'google-sub-moi',
      email: 'workspace@test.local',
      name: 'Người Mới',
    });
    await google('tok-moi-cung-email').expect(409);

    const owner = await harness.prisma.user.findUnique({
      where: { id: ownerId },
    });
    expect(owner?.googleId).toBe('google-sub-cu');
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
