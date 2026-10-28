import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

describe('Tra cứu lương công khai', () => {
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

  const seed = (positionSlug: string, visibility: 'PUBLIC' | 'INTERNAL') =>
    harness.prisma.salaryReference.create({
      data: {
        source: 'test',
        sourceUrl: `https://nguon.test/${positionSlug}`,
        fetchedAt: new Date(),
        visibility,
        industrySlug: 'it',
        positionSlug,
        positionName: `Vị trí ${positionSlug}`,
        occupationCode: 'IT',
        avgMonthly: 25_000_000,
        bands: {
          create: [{ experienceLabel: '1–3 năm', avgAmount: 20_000_000 }],
        },
      },
    });

  test('khách không token xem được bản PUBLIC, không thấy tên hay link nguồn; bản INTERNAL không lọt ra', async () => {
    await seed('backend-developer', 'PUBLIC');
    await seed('noi-bo', 'INTERNAL');

    await request(harness.server).get('/api/salary/occupations').expect(200);

    const list = await request(harness.server)
      .get('/api/salary/positions')
      .expect(200);
    const slugs = (list.body as Array<{ positionSlug: string }>).map(
      (row) => row.positionSlug,
    );
    expect(slugs).toEqual(['backend-developer']);

    const detail = await request(harness.server)
      .get('/api/salary/positions/backend-developer')
      .expect(200);
    expect(detail.body).not.toHaveProperty('provider');
    expect(JSON.stringify(detail.body)).not.toContain('nguon.test');

    await request(harness.server)
      .get('/api/salary/positions/noi-bo')
      .expect(404);
  });
});
