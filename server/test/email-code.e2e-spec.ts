import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

describe('Đăng ký và đăng nhập có mã xác minh email', () => {
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

  const EMAIL = 'ma-xac-minh@test.local';
  const PASSWORD = 'MatKhauTest123!';

  const register = (email = EMAIL) =>
    request(harness.server).post('/api/auth/register').send({
      email,
      name: 'Người Mới',
      password: PASSWORD,
      acceptTerms: true,
    });

  const verify = (code: string, email = EMAIL) =>
    request(harness.server).post('/api/auth/verify-code').send({ email, code });

  const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

  test('đăng ký chỉ gửi mã, chưa tạo tài khoản; nhập đúng mã thì tạo tài khoản đã xác minh và đăng nhập', async () => {
    const started = await register().expect(202);
    expect(started.body).toEqual({ verificationRequired: true, email: EMAIL });
    expect(started.headers['set-cookie']).toBeUndefined();
    expect(await harness.prisma.user.count()).toBe(0);

    const done = await verify(harness.mail.codeFor(EMAIL)).expect(200);
    expect(String(done.headers['set-cookie'])).toContain('aijob_token=');

    const user = await harness.prisma.user.findUniqueOrThrow({
      where: { email: EMAIL },
    });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.termsAcceptedAt).toBeInstanceOf(Date);
  });

  test('mã chỉ dùng được một lần', async () => {
    await register().expect(202);
    const code = harness.mail.codeFor(EMAIL);

    await verify(code).expect(200);
    await verify(code).expect(400);
  });

  test('sai mã báo số lần còn lại; sai 5 lần thì khoá mã, kể cả mã đúng', async () => {
    await register().expect(202);
    const code = harness.mail.codeFor(EMAIL);

    const first = await verify(wrong(code)).expect(400);
    expect((first.body as { message: string }).message).toContain('còn 4 lần');
    for (let i = 0; i < 4; i += 1) await verify(wrong(code)).expect(400);

    const locked = await verify(code).expect(400);
    expect((locked.body as { reason: string }).reason).toBe('CODE_EXPIRED');
    expect(await harness.prisma.user.count()).toBe(0);
  });

  test('mã hết hạn bị từ chối', async () => {
    await register().expect(202);
    await harness.prisma.emailCode.update({
      where: { email: EMAIL },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await verify(harness.mail.codeFor(EMAIL)).expect(400);
  });

  test('gửi lại phải đợi 60 giây; gửi lại thì mã cũ chết, mã mới dùng được', async () => {
    await register().expect(202);
    const oldCode = harness.mail.codeFor(EMAIL);
    const resend = () =>
      request(harness.server)
        .post('/api/auth/resend-code')
        .send({ email: EMAIL });

    await resend().expect(400);

    await harness.prisma.emailCode.update({
      where: { email: EMAIL },
      data: { sentAt: new Date(Date.now() - 61_000) },
    });
    await resend().expect(200);
    const newCode = harness.mail.codeFor(EMAIL);

    if (newCode !== oldCode) await verify(oldCode).expect(400);
    await verify(newCode).expect(200);
  });

  test('đăng ký lại trong 60 giây không gửi thêm thư nhưng nhận mật khẩu mới nhất', async () => {
    await register().expect(202);
    await request(harness.server)
      .post('/api/auth/register')
      .send({
        email: EMAIL,
        name: 'Người Mới',
        password: 'MatKhauKhac456!',
        acceptTerms: true,
      })
      .expect(202);
    expect(harness.mail.sent).toHaveLength(1);

    await verify(harness.mail.codeFor(EMAIL)).expect(200);
    await request(harness.server)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'MatKhauKhac456!' })
      .expect(200);
  });

  test('email đã có tài khoản thì đăng ký trả 409, không gửi mã', async () => {
    const user = await harness.signUp();
    harness.mail.reset();

    await register(user.email).expect(409);
    expect(harness.mail.sent).toHaveLength(0);
  });

  test('gửi lại khi không có phiên xác minh trả 400', async () => {
    await request(harness.server)
      .post('/api/auth/resend-code')
      .send({ email: 'khong-co@test.local' })
      .expect(400);
  });

  test('gửi thư lỗi thì trả lỗi và cho gửi lại ngay', async () => {
    harness.mail.failNext = true;
    await register().expect(500);

    await request(harness.server)
      .post('/api/auth/resend-code')
      .send({ email: EMAIL })
      .expect(200);
    await verify(harness.mail.codeFor(EMAIL)).expect(200);
  });

  describe('tài khoản mật khẩu cũ chưa xác minh', () => {
    const legacy = async () => {
      const user = await harness.signUp();
      await harness.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: null },
      });
      harness.mail.reset();
      return user;
    };

    test('đăng nhập đúng mật khẩu thì phải nhập mã rồi mới có phiên', async () => {
      const user = await legacy();

      const pending = await request(harness.server)
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(202);
      expect(pending.headers['set-cookie']).toBeUndefined();

      await verify(harness.mail.codeFor(user.email), user.email).expect(200);
      const row = await harness.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(row.emailVerifiedAt).toBeInstanceOf(Date);
      expect(row.passwordHash).not.toBeNull();
    });

    test('sai mật khẩu thì 401 và không gửi mã', async () => {
      const user = await legacy();

      await request(harness.server)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'SaiMatKhau999' })
        .expect(401);
      expect(harness.mail.sent).toHaveLength(0);
    });

    test('tiện ích không đăng nhập được tới khi xác minh trên web', async () => {
      const user = await legacy();

      await request(harness.server)
        .post('/api/ext/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(403);
    });
  });
});
