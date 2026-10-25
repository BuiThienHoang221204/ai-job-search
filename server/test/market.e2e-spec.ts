import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

describe('Báo cáo thị trường công khai', () => {
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

  const seed = (count: number, occupationCode: string) =>
    harness.prisma.job.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        source: 'test',
        externalId: `${occupationCode}-${index}`,
        url: `https://example.test/${occupationCode}-${index}`,
        title: `Tin ${index}`,
        company: `Công ty ${index % 7}`,
        companyKey: `cong ty ${index % 7}`,
        description: 'Mô tả',
        tags: [],
        occupationCode,
        provinceCode: index % 2 ? 'HN' : 'HCM',
        salaryMin: 10_000_000,
        salaryMax: 20_000_000,
        postedAt: new Date(),
      })),
    });

  test('khách xem được báo cáo ngành đủ 100 tin; ngành ít tin hoặc slug lạ thì 404', async () => {
    await seed(100, 'IT');
    await seed(20, 'FINANCE');

    const list = await request(harness.server)
      .get('/api/public/market')
      .expect(200);
    expect(list.body).toEqual([
      { slug: 'cong-nghe-thong-tin', name: 'Công nghệ thông tin', total: 100 },
    ]);

    const report = await request(harness.server)
      .get('/api/public/market/cong-nghe-thong-tin')
      .expect(200);
    expect(report.body).toMatchObject({
      total: 100,
      companies: 7,
      salary: { median: 15_000_000, withSalaryPercent: 100 },
    });

    await request(harness.server)
      .get('/api/public/market/ke-toan-kiem-toan-tai-chinh')
      .expect(404);
    await request(harness.server)
      .get('/api/public/market/khong-co')
      .expect(404);
  });
});
