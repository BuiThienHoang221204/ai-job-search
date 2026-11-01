import request from 'supertest';
import { createTestApp, type TestApp } from './support/app-harness.js';

type SaveBody = { jobId: string; saved: boolean };

const JOB = {
  url: 'https://example.com/jobs/backend-123',
  title: 'Backend Developer',
  company: 'Acme',
  descriptionText: 'Java, Spring Boot, PostgreSQL. 3 năm kinh nghiệm.',
};

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

describe('Ext jobs (/api/ext/jobs/save)', () => {
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

  it('tạo Job nguồn extension + SavedJob; dedup theo url; 401 khi không token', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);

    const res = await request(app.server)
      .post('/api/ext/jobs/save')
      .set('Authorization', `Bearer ${token}`)
      .send(JOB)
      .expect(200);
    const { jobId, saved } = res.body as SaveBody;
    expect(saved).toBe(true);

    const job = await app.prisma.job.findUnique({ where: { id: jobId } });
    expect(job?.source).toBe('extension');
    expect(job?.title).toBe('Backend Developer');
    const savedRow = await app.prisma.savedJob.findUnique({
      where: { userId_jobId: { userId: user.id, jobId } },
    });
    expect(savedRow).not.toBeNull();

    const again = await request(app.server)
      .post('/api/ext/jobs/save')
      .set('Authorization', `Bearer ${token}`)
      .send(JOB)
      .expect(200);
    expect((again.body as SaveBody).jobId).toBe(jobId);
    expect(await app.prisma.job.count({ where: { url: JOB.url } })).toBe(1);

    await request(app.server).post('/api/ext/jobs/save').send(JOB).expect(401);
  });

  it('dùng lại Job đã có cùng url thay vì tạo bản extension trùng', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);

    const scraped = await app.prisma.job.create({
      data: {
        source: 'topcv',
        externalId: 'tc-1',
        url: JOB.url,
        title: 'Backend (scraped)',
        company: 'Acme',
        description: 'mô tả tin scrape',
      },
      select: { id: true },
    });

    const res = await request(app.server)
      .post('/api/ext/jobs/save')
      .set('Authorization', `Bearer ${token}`)
      .send(JOB)
      .expect(200);
    expect((res.body as SaveBody).jobId).toBe(scraped.id);
    expect(await app.prisma.job.count({ where: { url: JOB.url } })).toBe(1);
  });

  it('URL có tham số tracking vẫn ghép vào tin đã có (chuẩn hoá url)', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    const clean = 'https://topcv.vn/viec-lam/khop-123.html';
    const scraped = await app.prisma.job.create({
      data: {
        source: 'topcv',
        externalId: 'tc-track',
        url: clean,
        title: 'Backend (scraped)',
        company: 'Acme',
        description: 'mô tả tin scrape',
      },
      select: { id: true },
    });

    const res = await request(app.server)
      .post('/api/ext/jobs/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...JOB, url: `${clean}?ta_source=BoxFeatureJob&utm_medium=cpc` })
      .expect(200);

    expect((res.body as SaveBody).jobId).toBe(scraped.id);
    expect(await app.prisma.job.count({ where: { url: clean } })).toBe(1);
  });

  it('hai lần lưu ĐỒNG THỜI cùng url mới chỉ tạo một Job', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    const send = () =>
      request(app.server)
        .post('/api/ext/jobs/save')
        .set('Authorization', `Bearer ${token}`)
        .send(JOB);

    const [a, b] = await Promise.all([send(), send()]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect((a.body as SaveBody).jobId).toBe((b.body as SaveBody).jobId);
    expect(await app.prisma.job.count({ where: { url: JOB.url } })).toBe(1);
  });

  it('Job extension KHÔNG lọt feed chung, chỉ hiện ở danh sách đã lưu của chủ', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    const saved = await request(app.server)
      .post('/api/ext/jobs/save')
      .set('Authorization', `Bearer ${token}`)
      .send(JOB)
      .expect(200);
    const { jobId } = saved.body as SaveBody;

    const feed = await request(app.server)
      .get('/api/jobs')
      .set('Cookie', user.cookie)
      .expect(200);
    expect(JSON.stringify(feed.body)).not.toContain(jobId);

    const savedList = await request(app.server)
      .get('/api/jobs')
      .query({ saved: 'true' })
      .set('Cookie', user.cookie)
      .expect(200);
    expect(JSON.stringify(savedList.body)).toContain(jobId);
  });

  it('lưu kèm logo / địa điểm / lương / ngày đăng vào Job', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);

    const res = await request(app.server)
      .post('/api/ext/jobs/save')
      .set('Authorization', `Bearer ${token}`)
      .send({
        url: 'https://example.com/jobs/full-456',
        title: 'Fullstack Engineer',
        company: 'Toshiba',
        descriptionText: 'NodeJS, ReactJS.',
        logoUrl: 'https://cdn.example.com/toshiba.png',
        locationText: 'Hà Nội, VN',
        salaryText: '15 - 20 triệu',
        postedText: '2026-10-28',
      })
      .expect(200);

    const job = await app.prisma.job.findUnique({
      where: { id: (res.body as SaveBody).jobId },
    });
    expect(job?.companyLogo).toBe('https://cdn.example.com/toshiba.png');
    expect(job?.location).toBe('Hà Nội, VN');
    expect(job?.salaryRaw).toBe('15 - 20 triệu');
    expect(job?.postedAt?.toISOString().slice(0, 10)).toBe('2026-10-28');
  });

  it('postedText không hợp lệ thì postedAt để trống, không vỡ', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);

    const res = await request(app.server)
      .post('/api/ext/jobs/save')
      .set('Authorization', `Bearer ${token}`)
      .send({
        url: 'https://example.com/jobs/baddate',
        title: 'Backend Developer',
        descriptionText: 'Java.',
        postedText: 'không-phải-ngày',
      })
      .expect(200);

    const job = await app.prisma.job.findUnique({
      where: { id: (res.body as SaveBody).jobId },
    });
    expect(job?.postedAt).toBeNull();
  });

  it('từ chối url không phải http(s) (chống javascript:/data:)', async () => {
    const user = await app.signUp();
    const token = await extToken(app, user.email, user.password);
    await request(app.server)
      .post('/api/ext/jobs/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...JOB, url: 'javascript:alert(1)' })
      .expect(400);
  });
});
