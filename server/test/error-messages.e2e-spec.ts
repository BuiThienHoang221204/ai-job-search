import request from 'supertest';
import { THROTTLED_MESSAGE } from 'src/app.module.js';
import { UNAUTHORIZED_MESSAGE } from 'src/common/guards/jwt-auth.guard.js';
import { createTestApp, type TestApp } from './support/app-harness.js';

describe('Thông báo 401 và 429 bằng tiếng Việt', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ throttle: true });
  });

  afterAll(async () => {
    await harness.close();
  });

  test('gọi route cần đăng nhập mà không có token thì nhận 401 tiếng Việt', async () => {
    const response = await request(harness.server)
      .get('/api/auth/me')
      .expect(401);

    expect((response.body as { message: string }).message).toBe(
      UNAUTHORIZED_MESSAGE,
    );
  });

  test('token sai chữ ký cũng là 401 tiếng Việt, không lộ lý do của passport', async () => {
    const response = await request(harness.server)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer khong.phai.token')
      .expect(401);

    expect((response.body as { message: string }).message).toBe(
      UNAUTHORIZED_MESSAGE,
    );
  });

  test('vượt trần gọi thì nhận 429 tiếng Việt', async () => {
    const attempt = () =>
      request(harness.server)
        .post('/api/auth/login')
        .send({ email: 'khong-ton-tai@test.local', password: 'saibetnhe' });

    for (let i = 0; i < 10; i += 1) await attempt();
    const blocked = await attempt();

    expect(blocked.status).toBe(429);
    expect((blocked.body as { message: string }).message).toBe(
      THROTTLED_MESSAGE,
    );
  });

  test('mọi phản hồi mang x-request-id; id hợp lệ từ client được giữ, id lạ bị thay', async () => {
    const kept = await request(harness.server)
      .get('/api/health')
      .set('x-request-id', 'loi-tu-fe-123');
    const replaced = await request(harness.server)
      .get('/api/health')
      .set('x-request-id', 'xin chao!');

    expect(kept.headers['x-request-id']).toBe('loi-tu-fe-123');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
