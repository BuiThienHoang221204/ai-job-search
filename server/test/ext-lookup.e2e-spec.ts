import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

async function extToken(
  app: TestApp,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.server)
    .post('/api/ext/auth/login')
    .send({ email, password })
    .expect(200);
  return (res.body as { token: string }).token;
}

const JOB = {
  url: 'https://topcv.vn/viec-lam/full-stack-developer/999001',
  title: 'Full Stack Developer',
  descriptionText:
    'Phát triển web với React và Angular. Tối thiểu 4 năm kinh nghiệm backend.',
};

const REQUIREMENTS = {
  requiredSkills: [{ options: ['React'] }, { options: ['Angular'] }],
  niceToHaveSkills: [{ options: ['Docker'] }],
  minYears: 4,
  seniority: 'SENIOR',
  citizenshipRequired: null,
  workPermitRequired: false,
  eligibilityQuote: '',
  city: null,
  remotePolicy: 'ONSITE',
};

describe('Ext lookup (/api/ext/lookup)', () => {
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

  it('tin đã có match + yêu cầu → lookup trả cả hai, KHÔNG gọi model', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    await app.prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        primarySkills: ['React', 'Node.js'],
        secondarySkills: ['SQL'],
      },
      update: { primarySkills: ['React', 'Node.js'], secondarySkills: ['SQL'] },
    });

    app.ai.willReturn(REQUIREMENTS);
    const gapsRes = await request(app.server)
      .post('/api/ext/upskill/gaps')
      .set('Authorization', `Bearer ${token}`)
      .send(JOB)
      .expect(200);
    const jobId = (gapsRes.body as { jobId: string }).jobId;

    await app.prisma.jobMatch.create({
      data: {
        userId: user.id,
        jobId,
        status: 'DONE',
        overallScore: 72,
        strengths: ['Nền tảng React tốt'],
        gaps: ['Thiếu Angular'],
        evaluatedAt: new Date(),
      },
    });

    const res = await request(app.server)
      .post('/api/ext/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: JOB.url })
      .expect(200);

    const body = res.body as {
      match: { overallScore: number; stale: boolean } | null;
      gaps: { missingRequired: string[] } | null;
    };
    expect(body.match?.overallScore).toBe(72);
    expect(body.match?.stale).toBe(false);
    expect(body.gaps?.missingRequired).toContain('Angular');
    // chỉ 1 lượt model của bước rút yêu cầu; lookup không gọi model
    expect(app.ai.calls.length).toBe(1);
  });

  it('url chưa từng lưu → match & gaps null, không lỗi', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);

    const res = await request(app.server)
      .post('/api/ext/lookup')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'https://topcv.vn/viec-lam/khong-ton-tai/1' })
      .expect(200);

    const body = res.body as { match: unknown; gaps: unknown };
    expect(body.match).toBeNull();
    expect(body.gaps).toBeNull();
    expect(app.ai.calls.length).toBe(0);
  });

  it('401 khi không có ext token', async () => {
    await request(app.server)
      .post('/api/ext/lookup')
      .send({ url: JOB.url })
      .expect(401);
  });
});
