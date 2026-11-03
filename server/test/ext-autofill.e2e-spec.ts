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

describe('Ext autofill (/api/ext)', () => {
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

  it('GET /ext/profile/autofill: trả bộ trường điền từ hồ sơ', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    await app.prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        phone: '0900000000',
        headline: 'Backend Developer',
        primarySkills: ['NestJS', 'Postgres'],
      },
      update: {
        phone: '0900000000',
        headline: 'Backend Developer',
        primarySkills: ['NestJS', 'Postgres'],
      },
    });

    const res = await request(app.server)
      .get('/api/ext/profile/autofill')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as {
      email: string;
      phone: string | null;
      headline: string | null;
      skills: string[];
      fullName: string;
    };
    expect(body.email).toBe(user.email);
    expect(body.phone).toBe('0900000000');
    expect(body.headline).toBe('Backend Developer');
    expect(body.skills).toEqual(expect.arrayContaining(['NestJS', 'Postgres']));
    expect(typeof body.fullName).toBe('string');
  });

  it('POST /ext/autofill/answer: AI soạn câu trả lời từ hồ sơ', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    app.ai.willReturn({
      answer: 'Tôi mong đóng góp kỹ năng backend của mình cho đội ngũ.',
    });

    const res = await request(app.server)
      .post('/api/ext/autofill/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'Vì sao bạn muốn làm ở đây?', company: 'Acme' })
      .expect(200);
    const body = res.body as { answer: string; remaining: number };
    expect(body.answer).toContain('backend');
    expect(body.remaining).toBe(1);
    expect(app.ai.calls[0].purpose).toBe('ext.autofillAnswer');
  });

  it('POST /ext/autofill/answer: hết hạn mức ngày → 429, không gọi AI', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    await app.prisma.aiCall.createMany({
      data: [0, 1].map(() => ({
        userId: user.id,
        purpose: 'ext.autofillAnswer',
        provider: 'test',
        modelId: 'test',
        ok: true,
        durationMs: 0,
      })),
    });

    await request(app.server)
      .post('/api/ext/autofill/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'Vì sao bạn muốn làm ở đây?' })
      .expect(429);
    expect(app.ai.calls.length).toBe(0);
  });

  it('401 khi không có ext token', async () => {
    await request(app.server)
      .post('/api/ext/autofill/answer')
      .send({ question: 'Vì sao bạn muốn làm ở đây?' })
      .expect(401);
  });
});
