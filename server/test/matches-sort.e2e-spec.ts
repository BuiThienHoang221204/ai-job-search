import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

describe('GET /matches · sắp xếp', () => {
  let harness: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  const list = (query: Record<string, unknown> = {}) =>
    request(harness.server).get('/api/matches').query(query).set(auth());

  type Page = { items: { job: { title: string } }[]; total: number };

  const titles = (res: { body: unknown }) =>
    (res.body as Page).items.map((item) => item.job.title);

  const scored = async (
    title: string,
    overallScore: number,
    daysAgo: number,
    owner = user,
  ) => {
    const job = await harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: `${owner.id}-${title}`,
        url: `https://example.test/${encodeURIComponent(title)}`,
        title,
        company: 'Công ty Thử Nghiệm',
        description: 'Mô tả công việc đủ dài để là một tin tuyển dụng hợp lệ.',
      },
    });
    await harness.prisma.jobMatch.create({
      data: {
        userId: owner.id,
        jobId: job.id,
        status: 'DONE',
        overallScore,
        evaluatedAt: new Date(Date.now() - daysAgo * 86_400_000),
      },
    });
  };

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
    await scored('Cũ điểm cao', 90, 10);
    await scored('Mới điểm thấp', 40, 0);
    await scored('Giữa điểm vừa', 70, 3);
  });

  test('mặc định xếp lượt chấm mới nhất lên trước', async () => {
    const res = await list().expect(200);
    expect(titles(res)).toEqual([
      'Mới điểm thấp',
      'Giữa điểm vừa',
      'Cũ điểm cao',
    ]);
  });

  test('score_desc và score_asc xếp theo điểm', async () => {
    const desc = await list({ sort: 'score_desc' }).expect(200);
    expect(titles(desc)).toEqual([
      'Cũ điểm cao',
      'Giữa điểm vừa',
      'Mới điểm thấp',
    ]);
    const asc = await list({ sort: 'score_asc' }).expect(200);
    expect(titles(asc)).toEqual([
      'Mới điểm thấp',
      'Giữa điểm vừa',
      'Cũ điểm cao',
    ]);
  });

  test('hoà điểm thì lượt chấm mới hơn đứng trước', async () => {
    await scored('Mới hoà điểm', 90, 1);
    const res = await list({ sort: 'score_desc' }).expect(200);
    expect(titles(res).slice(0, 2)).toEqual(['Mới hoà điểm', 'Cũ điểm cao']);
  });

  test('giá trị sort lạ bị từ chối 400', async () => {
    await list({ sort: 'oldest' }).expect(400);
  });

  test('không lẫn tin người khác đã chấm', async () => {
    const other = await harness.signUp();
    await scored('Tin của người khác', 99, 0, other);
    const res = await list({ sort: 'score_desc' }).expect(200);
    expect(titles(res)).not.toContain('Tin của người khác');
    expect((res.body as Page).total).toBe(3);
  });
});
