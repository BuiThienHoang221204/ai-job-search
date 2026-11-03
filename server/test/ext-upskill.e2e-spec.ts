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
  url: 'https://topcv.vn/viec-lam/full-stack-developer/123456',
  title: 'Full Stack Developer',
  descriptionText:
    'Tham gia phát triển ứng dụng web với React và Angular. Yêu cầu tối thiểu 4 năm kinh nghiệm backend.',
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

describe('Ext upskill gaps (/api/ext/upskill)', () => {
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

  it('POST /ext/upskill/gaps: chỉ ra kỹ năng đã đạt / còn thiếu bằng code', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    await app.prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        primarySkills: ['React', 'Node.js'],
        secondarySkills: ['SQL'],
      },
      update: {
        primarySkills: ['React', 'Node.js'],
        secondarySkills: ['SQL'],
      },
    });
    app.ai.willReturn(REQUIREMENTS);

    const res = await request(app.server)
      .post('/api/ext/upskill/gaps')
      .set('Authorization', `Bearer ${token}`)
      .send(JOB)
      .expect(200);

    const body = res.body as {
      jobId: string;
      have: string[];
      missingRequired: string[];
      missingNice: string[];
      years: { enough: boolean } | null;
      readiness: number;
    };
    expect(typeof body.jobId).toBe('string');
    expect(body.have).toContain('React');
    expect(body.missingRequired).toContain('Angular');
    expect(body.missingNice).toContain('Docker');
    expect(body.years?.enough).toBe(false);
    expect(typeof body.readiness).toBe('number');
    expect(app.ai.calls[0].purpose).toBe('job.requirements');
  });

  it('dùng lại yêu cầu đã rút của tin, KHÔNG gọi model lần hai', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    app.ai.willReturn(REQUIREMENTS);

    await request(app.server)
      .post('/api/ext/upskill/gaps')
      .set('Authorization', `Bearer ${token}`)
      .send(JOB)
      .expect(200);
    await request(app.server)
      .post('/api/ext/upskill/gaps')
      .set('Authorization', `Bearer ${token}`)
      .send(JOB)
      .expect(200);

    expect(app.ai.calls.length).toBe(1);
  });

  it('401 khi không có ext token', async () => {
    await request(app.server)
      .post('/api/ext/upskill/gaps')
      .send(JOB)
      .expect(401);
  });

  it('POST /ext/upskill/plan: AI gợi ý cách bổ sung kỹ năng thiếu', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    app.ai.willReturn({
      items: [
        {
          skill: 'Angular',
          how: 'Học qua tài liệu chính thức rồi làm một dự án nhỏ.',
        },
      ],
    });

    const res = await request(app.server)
      .post('/api/ext/upskill/plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ skills: ['Angular', 'Docker'] })
      .expect(200);

    const body = res.body as {
      items: { skill: string; how: string }[];
      remaining: number;
    };
    expect(body.items[0].skill).toBe('Angular');
    expect(body.items[0].how).toContain('dự án');
    expect(body.remaining).toBe(1);
    expect(app.ai.calls[0].purpose).toBe('ext.upskillPlan');
  });

  it('POST /ext/upskill/plan: hết hạn mức → 429, không gọi AI', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    await app.prisma.aiCall.createMany({
      data: [0, 1].map(() => ({
        userId: user.id,
        purpose: 'ext.upskillPlan',
        provider: 'test',
        modelId: 'test',
        ok: true,
        durationMs: 0,
      })),
    });

    await request(app.server)
      .post('/api/ext/upskill/plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ skills: ['Angular'] })
      .expect(429);
    expect(app.ai.calls.length).toBe(0);
  });

  it('POST /ext/upskill/plan: skills rỗng → 400, không gọi AI', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);

    await request(app.server)
      .post('/api/ext/upskill/plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ skills: [] })
      .expect(400);
    expect(app.ai.calls.length).toBe(0);
  });
});
