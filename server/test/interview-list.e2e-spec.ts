import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

describe('GET /interview · danh sách chỉ trả bản tóm tắt', () => {
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
        source: 'test',
        externalId: 'tin-phong-van',
        url: 'https://example.test/tin-phong-van',
        title: 'Backend Developer',
        company: 'Công ty Thử Nghiệm',
        description: 'Mô tả đủ dài để qua được kiểm tra đầu vào của DTO.',
        tags: [],
      },
    });
    jobId = job.id;
  });

  const auth = (who: TestUser) => ({ Authorization: `Bearer ${who.token}` });

  const seedPrep = (owner: TestUser = user) =>
    harness.prisma.interviewPrep.create({
      data: {
        userId: owner.id,
        jobId,
        status: 'DONE',
        talkingPoints: ['Kể về dự án thanh toán'],
        questionsToAsk: ['Đội có bao nhiêu người?'],
        starAnswers: [{ question: 'Q', answer: 'A' }],
      },
    });

  test('danh sách có trạng thái và tin, KHÔNG có nội dung bộ câu hỏi', async () => {
    await seedPrep();

    const response = await request(harness.server)
      .get('/api/interview')
      .set(auth(user))
      .expect(200);
    const [item] = (response.body as { items: Record<string, unknown>[] })
      .items;

    expect(item).toMatchObject({
      jobId,
      status: 'DONE',
      failureKind: null,
      job: { title: 'Backend Developer', company: 'Công ty Thử Nghiệm' },
    });
    expect(item).not.toHaveProperty('starAnswers');
    expect(item).not.toHaveProperty('talkingPoints');
    expect(item).not.toHaveProperty('error');
  });

  test('nội dung đầy đủ vẫn lấy được qua GET /interview/:jobId', async () => {
    await seedPrep();

    const response = await request(harness.server)
      .get(`/api/interview/${jobId}`)
      .set(auth(user))
      .expect(200);

    expect(response.body).toMatchObject({
      talkingPoints: ['Kể về dự án thanh toán'],
      questionsToAsk: ['Đội có bao nhiêu người?'],
      job: { title: 'Backend Developer', company: 'Công ty Thử Nghiệm' },
    });
    expect((response.body as { job: object }).job).not.toHaveProperty(
      'description',
    );
  });

  test('không thấy bộ câu hỏi của người khác', async () => {
    const other = await harness.signUp();
    await seedPrep(other);

    const response = await request(harness.server)
      .get('/api/interview')
      .set(auth(user))
      .expect(200);

    expect((response.body as { total: number }).total).toBe(0);
  });
});
