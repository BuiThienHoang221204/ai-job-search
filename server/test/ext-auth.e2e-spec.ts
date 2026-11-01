import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

type ExtUser = { id: string; email: string; name: string };
type ExtAuthBody = { token: string; user: ExtUser };
type MeBody = { user: ExtUser };

describe('Ext auth (/api/ext/auth)', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await app.reset();
  });
  afterAll(async () => {
    await app.close();
  });

  it('đăng nhập email/mật khẩu trả token dùng được ở /me', async () => {
    const user = await app.signUp();

    const login = await request(app.server)
      .post('/api/ext/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const loginBody = login.body as ExtAuthBody;
    expect(typeof loginBody.token).toBe('string');
    expect(loginBody.user.email).toBe(user.email);

    const me = await request(app.server)
      .get('/api/ext/auth/me')
      .set('Authorization', `Bearer ${loginBody.token}`)
      .expect(200);
    const meBody = me.body as MeBody;
    expect(meBody.user.id).toBe(user.id);
    expect(meBody.user).not.toHaveProperty('role');
  });

  it('sai mật khẩu → 401', async () => {
    const user = await app.signUp();
    await request(app.server)
      .post('/api/ext/auth/login')
      .send({ email: user.email, password: 'SaiMatKhau123!' })
      .expect(401);
  });

  it('/me không token → 401, và từ chối access token của web (sai loại)', async () => {
    const user = await app.signUp();
    await request(app.server).get('/api/ext/auth/me').expect(401);
    await request(app.server)
      .get('/api/ext/auth/me')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(401);
  });

  it('/token cần phiên web; token cấp ra dùng được ở /me', async () => {
    const user = await app.signUp();

    await request(app.server).post('/api/ext/auth/token').expect(401);

    const issued = await request(app.server)
      .post('/api/ext/auth/token')
      .set('Cookie', user.cookie)
      .expect(200);
    const issuedBody = issued.body as ExtAuthBody;
    expect(typeof issuedBody.token).toBe('string');

    await request(app.server)
      .get('/api/ext/auth/me')
      .set('Authorization', `Bearer ${issuedBody.token}`)
      .expect(200);
  });

  it('đăng xuất web thu hồi luôn ext token (tokenVersion)', async () => {
    const user = await app.signUp();
    const login = await request(app.server)
      .post('/api/ext/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const loginBody = login.body as ExtAuthBody;

    await request(app.server)
      .post('/api/auth/logout')
      .set('Cookie', user.cookie)
      .expect(200);

    await request(app.server)
      .get('/api/ext/auth/me')
      .set('Authorization', `Bearer ${loginBody.token}`)
      .expect(401);
  });

  it('/profile trả kỹ năng hồ sơ của chính người đăng nhập (gộp, khử trùng)', async () => {
    const user = await app.signUp();
    await app.prisma.profile.update({
      where: { userId: user.id },
      data: {
        primarySkills: ['Java', 'Spring Boot'],
        secondarySkills: ['Docker', 'Java'],
      },
    });
    const login = await request(app.server)
      .post('/api/ext/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const token = (login.body as ExtAuthBody).token;

    const res = await request(app.server)
      .get('/api/ext/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((res.body as { skills: string[] }).skills).toEqual([
      'Java',
      'Spring Boot',
      'Docker',
    ]);

    await request(app.server).get('/api/ext/profile').expect(401);
  });
});
