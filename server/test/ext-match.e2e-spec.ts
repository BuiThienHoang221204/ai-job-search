import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

type QuickBody = { jobId: string; queued: boolean; alreadyScored: boolean };
type MatchBody = {
  status: string;
  overallScore: number | null;
  strengths: string[];
  gaps: string[];
};

const JOB = {
  url: 'https://example.com/jobs/match-1',
  title: 'Fullstack Developer',
  company: 'Acme',
  descriptionText: 'React, NextJS, NestJS, Docker. Hà Nội. 2 năm kinh nghiệm.',
};

const evaluation = () => ({
  eligibility: { verdict: 'PASS', quote: '', note: 'Không đòi quốc tịch.' },
  technical: { score: 80, note: 'Có React và NestJS, khớp yêu cầu chính.' },
  experience: { score: 60, note: 'Một năm, thấp hơn mức hai năm tin yêu cầu.' },
  behavioral: { score: 70, note: 'Tự học và phối hợp nhóm nhỏ.' },
  career: { score: 90, note: 'Khớp định hướng fullstack.' },
  location: { pass: true, note: 'Hà Nội, trùng nơi ứng viên sống.' },
  strengths: ['Thành thạo React và NextJS đúng yêu cầu tin.'],
  gaps: ['Chưa có kinh nghiệm Docker mà tin nêu là điểm cộng.'],
  recommendation: 'Nên ứng tuyển, nhấn mạnh kinh nghiệm frontend.',
});

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

describe('Ext match (/api/ext/match)', () => {
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

  it('lưu tin + xếp hàng chấm AI cho chủ; poll ra kết quả DONE', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    app.ai.willReturn(evaluation());

    const quick = await request(app.server)
      .post('/api/ext/match/quick')
      .set('Authorization', `Bearer ${token}`)
      .send(JOB)
      .expect(200);
    const { jobId, queued } = quick.body as QuickBody;
    expect(queued).toBe(true);

    const saved = await app.prisma.savedJob.findUnique({
      where: { userId_jobId: { userId: user.id, jobId } },
    });
    expect(saved).not.toBeNull();

    await app.queue.drain();

    const res = await request(app.server)
      .get(`/api/ext/match/${jobId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const match = res.body as MatchBody;
    expect(match.status).toBe('DONE');
    expect(typeof match.overallScore).toBe('number');
    expect(match.strengths.length).toBeGreaterThan(0);
    expect(app.ai.calls[0].purpose).toBe('match.evaluate');
  });

  it('401 khi không có ext token', async () => {
    await request(app.server)
      .post('/api/ext/match/quick')
      .send(JOB)
      .expect(401);
  });
});
