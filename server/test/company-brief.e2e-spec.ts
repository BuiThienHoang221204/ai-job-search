import request from 'supertest';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import { DAY_MS } from 'src/common/duration.js';
import { companyKeyOf } from 'src/modules/companies/utils/company-key.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

describe('Bản tìm hiểu công ty · /companies/brief/by-job/:jobId', () => {
  let harness: TestApp;
  let user: TestUser;
  let jobId: string;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
    const job = await harness.prisma.job.create({
      data: {
        source: 'topcv',
        externalId: 'tin-cong-ty',
        url: 'https://example.test/tin-cong-ty',
        title: 'Kế toán tổng hợp',
        company: 'Công ty TNHH Smartbooks',
        description: 'Lập báo cáo thuế hằng tháng.',
      },
    });
    jobId = job.id;
  });

  const seedBrief = (updatedAt: Date) =>
    harness.prisma.companyBrief.create({
      data: {
        nameKey: companyKeyOf('Công ty TNHH Smartbooks')!,
        name: 'Công ty TNHH Smartbooks',
        verdict: 'MIXED',
        summary: 'Môi trường ổn, lương tăng chậm.',
        pros: ['Đào tạo bài bản'],
        cons: ['Lương thấp'],
        confidence: 'MEDIUM',
        rating: 3.7,
        reviewCount: 12,
        sources: [],
        modelId: 'opencode/mimo-noi-bo',
        expiresAt: new Date(Date.now() + 60 * DAY_MS),
        updatedAt,
      },
    });

  const refresh = (force: boolean) =>
    request(harness.server)
      .post(`/api/companies/brief/by-job/${jobId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ force });

  test('khách đọc được bản tìm hiểu nhưng không thấy trường nội bộ', async () => {
    await seedBrief(new Date());

    const response = await request(harness.server)
      .get(`/api/companies/brief/by-job/${jobId}`)
      .expect(200);

    const body = response.body as {
      stale: boolean;
      brief: Record<string, unknown>;
    };
    expect(body.stale).toBe(false);
    expect(body.brief.summary).toBe('Môi trường ổn, lương tăng chậm.');
    expect(body.brief.updatedAt).toEqual(expect.any(String));
    for (const hidden of ['modelId', 'id', 'nameKey', 'expiresAt']) {
      expect(body.brief).not.toHaveProperty(hidden);
    }
  });

  test('làm mới cưỡng bức ngay sau lượt trước bị từ chối, không xếp việc', async () => {
    await seedBrief(new Date());

    const response = await refresh(true).expect(409);

    expect((response.body as { message: string }).message).toContain(
      'vừa được làm mới',
    );
    expect(harness.queue.sentTo(QUEUE.COMPANY_BRIEF)).toEqual([]);
  });

  test('luồng stream cũng chặn làm mới cưỡng bức trong cửa sổ đó', async () => {
    await seedBrief(new Date());

    await request(harness.server)
      .post(`/api/companies/brief/by-job/${jobId}/stream?force=true`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({})
      .expect(409);
  });

  test('làm mới cưỡng bức bản đã cũ hơn một giờ thì vẫn xếp việc', async () => {
    await seedBrief(new Date(Date.now() - 2 * 60 * 60_000));

    await refresh(true).expect(201);

    expect(harness.queue.sentTo(QUEUE.COMPANY_BRIEF)).toHaveLength(1);
  });
});
