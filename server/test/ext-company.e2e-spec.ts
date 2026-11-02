import request from 'supertest';
import { companyKeyOf } from 'src/modules/companies/utils/company-key.js';
import { createTestApp, type TestApp } from './support/app-harness.js';

type ReviewBody = {
  queued: boolean;
  researchable: boolean;
  brief: { verdict: string; summary: string } | null;
};

async function extToken(app: TestApp, email: string, password: string): Promise<string> {
  const res = await request(app.server)
    .post('/api/ext/auth/login')
    .send({ email, password })
    .expect(200);
  return (res.body as { token: string }).token;
}

async function seedBrief(app: TestApp, company: string) {
  await app.prisma.companyBrief.create({
    data: {
      nameKey: companyKeyOf(company)!,
      name: company,
      verdict: 'POSITIVE',
      summary: 'Môi trường tốt, lương khá.',
      pros: ['Đồng nghiệp giỏi'],
      cons: ['Hơi nhiều việc'],
      confidence: 'MEDIUM',
      rating: 4.1,
      reviewCount: 12,
      sources: [],
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}

describe('Ext company (/api/ext/company)', () => {
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

  it('công ty mới: xếp hàng tìm hiểu nhưng KHÔNG tạo tin', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);

    const res = await request(app.server)
      .post('/api/ext/company/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'Zalora' })
      .expect(200);
    const body = res.body as ReviewBody;
    expect(body.researchable).toBe(true);
    expect(body.queued).toBe(true);
    expect(body.brief).toBeNull();

    expect(await app.prisma.job.count()).toBe(0);
  });

  it('công ty đã có bản tóm tắt còn hạn: trả cache, KHÔNG xếp hàng AI', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    await seedBrief(app, 'Zalora');

    const review = await request(app.server)
      .post('/api/ext/company/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'Zalora' })
      .expect(200);
    const body = review.body as ReviewBody;
    expect(body.queued).toBe(false);
    expect(body.brief?.verdict).toBe('POSITIVE');

    const poll = await request(app.server)
      .get('/api/ext/company')
      .query({ company: 'Zalora' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((poll.body as ReviewBody).brief?.summary).toContain('Môi trường');
  });

  it('công ty ẩn danh/không rõ: không nghiên cứu, không xếp hàng AI', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);

    const res = await request(app.server)
      .post('/api/ext/company/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'Không rõ' })
      .expect(200);
    const body = res.body as ReviewBody;
    expect(body.researchable).toBe(false);
    expect(body.queued).toBe(false);
  });

  it('401 khi không có ext token', async () => {
    await request(app.server)
      .post('/api/ext/company/review')
      .send({ company: 'Zalora' })
      .expect(401);
  });
});
