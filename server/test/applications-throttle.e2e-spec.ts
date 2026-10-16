import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

describe('POST /applications bị giới hạn như route gọi model', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ throttle: true });
  });

  afterAll(async () => {
    await harness.close();
  });

  test('quá 10 lượt mỗi phút thì nhận 429', async () => {
    const user = await harness.signUp();
    const job = await harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: 'tin-throttle',
        url: 'https://example.test/tin-throttle',
        title: 'Kế toán tổng hợp',
        company: 'Công ty Thử Nghiệm',
        description: 'Tuyển kế toán tổng hợp.',
      },
    });
    const create = () =>
      request(harness.server)
        .post('/api/applications')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ jobId: job.id, skipDocuments: true });

    for (let i = 0; i < 10; i += 1) {
      const response = await create();
      expect(response.status).not.toBe(429);
    }

    const blocked = await create();
    expect(blocked.status).toBe(429);
  });
});
