import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

describe('Probe sức khoẻ', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  test('/health không cần đăng nhập', async () => {
    const response = await request(harness.server)
      .get('/api/health')
      .expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
    expect(
      typeof (response.body as { uptimeSeconds: number }).uptimeSeconds,
    ).toBe('number');
  });
});
