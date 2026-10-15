import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

describe('GET /public/jobs · khách chưa đăng nhập xem tin', () => {
  let harness: TestApp;
  let jobId: string;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    const job = await harness.prisma.job.create({
      data: {
        source: 'topcv',
        externalId: 'tin-ke-toan',
        url: 'https://example.test/tin-ke-toan',
        title: 'Kế toán tổng hợp',
        company: 'Công ty A',
        location: 'Hà Nội',
        provinceCode: 'HN',
        occupationCode: 'FINANCE',
        salaryRaw: '15 - 20 triệu',
        salaryMin: 15_000_000,
        salaryMax: 20_000_000,
        description: 'Lập báo cáo thuế hằng tháng. '.repeat(60),
        searchText: 'ke toan tong hop cong ty a',
        requirements: {
          create: {
            status: 'DONE',
            requiredSkills: ['Excel', 'MISA'],
            minYears: 2,
          },
        },
      },
    });
    jobId = job.id;
    await harness.prisma.job.create({
      data: {
        source: 'itviec',
        externalId: 'tin-backend',
        url: 'https://example.test/tin-backend',
        title: 'Backend Developer',
        company: 'Công ty B',
        provinceCode: 'HCM',
        occupationCode: 'IT',
        description: 'NestJS, PostgreSQL.',
        searchText: 'backend developer cong ty b',
      },
    });
  });

  test('danh sách mở được khi không có token, và không lộ lương', async () => {
    const response = await request(harness.server)
      .get('/api/public/jobs')
      .expect(200);
    const body = response.body as {
      total: number;
      items: Record<string, unknown>[];
    };

    expect(body.total).toBe(2);
    for (const item of body.items) {
      expect(item).not.toHaveProperty('salaryRaw');
      expect(item).not.toHaveProperty('salaryMin');
      expect(item).not.toHaveProperty('salaryMax');
      expect(item).not.toHaveProperty('description');
    }
  });

  test('lọc theo ô tìm kiếm và tỉnh', async () => {
    const response = await request(harness.server)
      .get('/api/public/jobs')
      .query({ q: 'kế toán', province: 'HN' })
      .expect(200);
    const body = response.body as { items: { id: string }[] };

    expect(body.items.map((item) => item.id)).toEqual([jobId]);
  });

  test('bộ lọc gắn với tài khoản hoặc lương bị từ chối', async () => {
    for (const query of [
      { saved: 'true' },
      { salaryMin: 1 },
      { sort: 'match' },
    ]) {
      await request(harness.server)
        .get('/api/public/jobs')
        .query(query)
        .expect(400);
    }
  });

  test('chi tiết chỉ có đoạn trích, không lương, kèm danh sách yêu cầu', async () => {
    const response = await request(harness.server)
      .get(`/api/public/jobs/${jobId}`)
      .expect(200);
    const body = response.body as Record<string, unknown> & {
      description: string;
      systemMatch: {
        checks: { kind: string; label: string; met: boolean | null }[];
      };
    };

    expect(body).not.toHaveProperty('salaryRaw');
    expect(body).not.toHaveProperty('salaryMax');
    expect(body.description.length).toBeLessThanOrEqual(301);
    expect(body.description.endsWith('…')).toBe(true);
    expect(body.url).toBe('https://example.test/tin-ke-toan');
    const skills = body.systemMatch.checks.filter(
      (check) => check.kind === 'SKILL',
    );
    expect(skills.map((check) => check.label)).toEqual(['Excel', 'MISA']);
    expect(skills.every((check) => check.met === false)).toBe(true);
  });

  test('tin không tồn tại trả 404', async () => {
    await request(harness.server).get('/api/public/jobs/khong-co').expect(404);
  });

  test('danh mục bộ lọc mở cho khách, còn danh sách riêng vẫn cần đăng nhập', async () => {
    await request(harness.server).get('/api/jobs/filters').expect(200);
    await request(harness.server).get('/api/jobs').expect(401);
    await request(harness.server).get(`/api/jobs/${jobId}`).expect(401);
  });

  test('khách đọc được bản tìm hiểu công ty, nhưng không kích hoạt được AI', async () => {
    await request(harness.server)
      .get(`/api/companies/brief/by-job/${jobId}`)
      .expect(200);
    await request(harness.server)
      .post(`/api/companies/brief/by-job/${jobId}`)
      .send({})
      .expect(401);
    await request(harness.server)
      .post(`/api/companies/brief/by-job/${jobId}/stream`)
      .send({})
      .expect(401);
  });
});
