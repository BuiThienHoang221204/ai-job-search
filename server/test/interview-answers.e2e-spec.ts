import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

const STAR = {
  competency: 'Giải quyết vấn đề',
  question: 'Kể về một lần bạn tối ưu hệ thống?',
  situation: 'API thanh toán phản hồi chậm.',
  task: 'Tôi phụ trách tối ưu truy vấn.',
  action: 'Thêm index và cache Redis.',
  result: 'Thời gian phản hồi giảm 60%.',
};

const TOUGH = {
  question: 'Bạn chưa dùng Kubernetes đúng không?',
  why: 'Tin yêu cầu Kubernetes.',
  suggestedAnswer: 'Thừa nhận rồi bắc cầu sang Docker.',
};

const ANSWER =
  'Năm ngoái API thanh toán chậm, tôi thêm index và cache nên phản hồi nhanh hơn nhiều.';

type AnswerBody = {
  kind: string;
  index: number;
  answer: {
    text: string;
    feedback: { summary: string; improvements: string[] } | null;
    feedbackStale: boolean;
  } | null;
};

type PrepBody = {
  practiced: number;
  total: number;
  answers: Array<{ kind: string; index: number; text: string }>;
  application: { id: string; interviewAt: string | null } | null;
};

describe('Tự trả lời câu hỏi phỏng vấn', () => {
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
        externalId: 'tin-tra-loi',
        url: 'https://example.test/tin-tra-loi',
        title: 'Backend Developer',
        company: 'Công ty Thử Nghiệm',
        description:
          'Tuyển Backend Developer biết NestJS, Redis và Kubernetes.',
        tags: [],
      },
    });
    jobId = job.id;
  });

  const auth = (who: TestUser) => ({ Authorization: `Bearer ${who.token}` });

  const seedPrep = (owner: TestUser = user, star = STAR) =>
    harness.prisma.interviewPrep.upsert({
      where: { userId_jobId: { userId: owner.id, jobId } },
      create: {
        userId: owner.id,
        jobId,
        status: 'DONE',
        starAnswers: [star],
        toughQuestions: [TOUGH],
      },
      update: { starAnswers: [star] },
    });

  const save = (path: string, text: string, who: TestUser = user) =>
    request(harness.server)
      .put(`/api/interview/${jobId}/answers/${path}`)
      .set(auth(who))
      .send({ text });

  const prepOf = async (who: TestUser = user) =>
    (
      await request(harness.server)
        .get(`/api/interview/${jobId}`)
        .set(auth(who))
        .expect(200)
    ).body as PrepBody;

  test('lưu câu trả lời thì mức sẵn sàng tăng và câu trả lời quay lại khi mở bộ đề', async () => {
    await seedPrep();

    const saved = await save('tough/0', ANSWER).expect(200);
    expect((saved.body as AnswerBody).answer?.text).toBe(ANSWER);

    const prep = await prepOf();
    expect(prep).toMatchObject({ practiced: 1, total: 2 });
    expect(prep.answers).toEqual([
      expect.objectContaining({ kind: 'TOUGH', index: 0, text: ANSWER }),
    ]);
  });

  test('chuỗi rỗng là xoá câu trả lời', async () => {
    await seedPrep();
    await save('star/0', ANSWER).expect(200);

    const cleared = await save('star/0', '   ').expect(200);

    expect((cleared.body as AnswerBody).answer).toBeNull();
    expect((await prepOf()).practiced).toBe(0);
  });

  test('soạn lại bộ đề thì câu trả lời của câu đã đổi không còn được tính', async () => {
    await seedPrep();
    await save('star/0', ANSWER).expect(200);

    await seedPrep(user, { ...STAR, question: 'Một câu hỏi STAR khác?' });

    expect(await prepOf()).toMatchObject({ practiced: 0, answers: [] });
  });

  test('danh sách có mức sẵn sàng nhưng KHÔNG có nội dung bộ đề', async () => {
    await seedPrep();
    await save('star/0', ANSWER).expect(200);

    const response = await request(harness.server)
      .get('/api/interview')
      .set(auth(user))
      .expect(200);
    const [item] = (response.body as { items: Record<string, unknown>[] })
      .items;

    expect(item).toMatchObject({ practiced: 1, total: 2, application: null });
    expect(item).not.toHaveProperty('starAnswers');
    expect(item).not.toHaveProperty('toughQuestions');
  });

  test('câu hỏi ngoài bộ đề là 404, loại câu lạ là 400', async () => {
    await seedPrep();

    await save('tough/1', ANSWER).expect(404);
    await save('probe/0', ANSWER).expect(400);
    await save('star/-1', ANSWER).expect(400);
  });

  test('chưa có bộ đề thì không lưu được', async () => {
    await save('star/0', ANSWER).expect(404);
  });

  describe('quyền sở hữu', () => {
    test('không ghi được vào bộ đề của người khác', async () => {
      const other = await harness.signUp();
      await seedPrep(other);

      await save('star/0', ANSWER).expect(404);
      expect(
        await harness.prisma.interviewAnswer.count({
          where: { userId: user.id },
        }),
      ).toBe(0);
    });

    test('không thấy câu trả lời của người khác dù cùng một tin', async () => {
      const other = await harness.signUp();
      await seedPrep(other);
      await seedPrep();
      await save(
        'star/0',
        'Câu trả lời riêng của người kia, đủ dài.',
        other,
      ).expect(200);

      expect(await prepOf()).toMatchObject({ practiced: 0, answers: [] });
    });
  });

  describe('nhận xét', () => {
    const feedback = (text: string, who: TestUser = user) =>
      request(harness.server)
        .post(`/api/interview/${jobId}/answers/star/0/feedback`)
        .set(auth(who))
        .send({ text });

    test('lưu câu trả lời, gọi model đúng một lần và giữ lại nhận xét', async () => {
      await seedPrep();
      harness.ai.willReturn({
        summary: 'Đã có Bối cảnh và Hành động.',
        improvements: ['Nêu rõ phần việc của riêng bạn.'],
      });

      const response = await feedback(ANSWER).expect(200);

      expect((response.body as AnswerBody).answer).toMatchObject({
        text: ANSWER,
        feedback: { summary: 'Đã có Bối cảnh và Hành động.' },
        feedbackStale: false,
      });
      expect(harness.ai.calls).toHaveLength(1);
      expect(harness.ai.calls[0].purpose).toBe('interview.feedback');
      expect(harness.ai.calls[0].prompt).toContain(ANSWER);
      expect(harness.ai.calls[0].prompt).toContain(STAR.question);
    });

    test('sửa câu trả lời sau khi nhận xét thì nhận xét bị đánh dấu cũ', async () => {
      await seedPrep();
      harness.ai.willReturn({ summary: 'Ổn.', improvements: [] });
      await feedback(ANSWER).expect(200);

      const edited = await save('star/0', `${ANSWER} Thêm một câu.`).expect(
        200,
      );

      expect((edited.body as AnswerBody).answer).toMatchObject({
        feedback: { summary: 'Ổn.' },
        feedbackStale: true,
      });
    });

    test('câu trả lời quá ngắn bị chặn trước khi tốn lượt gọi model', async () => {
      await seedPrep();

      await feedback('Ngắn quá').expect(400);

      expect(harness.ai.calls).toHaveLength(0);
    });

    test('không nhờ nhận xét được trên bộ đề của người khác', async () => {
      const other = await harness.signUp();
      await seedPrep(other);

      await feedback(ANSWER).expect(404);

      expect(harness.ai.calls).toHaveLength(0);
    });
  });
});

describe('PUT /applications/:id/interview-date', () => {
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
        externalId: 'tin-lich',
        url: 'https://example.test/tin-lich',
        title: 'Backend Developer',
        company: 'Công ty Thử Nghiệm',
        description: 'Mô tả đủ dài để qua được kiểm tra đầu vào của DTO.',
        tags: [],
      },
    });
    jobId = job.id;
  });

  const seedApplication = async (owner: TestUser = user) =>
    (
      await harness.prisma.application.create({
        data: { userId: owner.id, jobId, status: 'APPLIED' },
      })
    ).id;

  const put = (id: string, body: object, who: TestUser = user) =>
    request(harness.server)
      .put(`/api/applications/${id}/interview-date`)
      .set({ Authorization: `Bearer ${who.token}` })
      .send(body);

  test('ghi rồi xoá ngày phỏng vấn', async () => {
    const id = await seedApplication();

    const set = await put(id, {
      interviewAt: '2026-10-20T09:00:00+07:00',
    }).expect(200);
    expect((set.body as { interviewAt: string }).interviewAt).toBe(
      '2026-10-20T02:00:00.000Z',
    );

    const cleared = await put(id, { interviewAt: null }).expect(200);
    expect((cleared.body as { interviewAt: null }).interviewAt).toBeNull();
  });

  test('ngày phỏng vấn hiện ở bộ đề của cùng tin', async () => {
    const id = await seedApplication();
    await harness.prisma.interviewPrep.create({
      data: { userId: user.id, jobId, status: 'DONE' },
    });
    await put(id, { interviewAt: '2026-10-20T02:00:00Z' }).expect(200);

    const response = await request(harness.server)
      .get(`/api/interview/${jobId}`)
      .set({ Authorization: `Bearer ${user.token}` })
      .expect(200);

    expect((response.body as PrepBody).application).toMatchObject({
      id,
      interviewAt: '2026-10-20T02:00:00.000Z',
    });
  });

  test('ngày sai định dạng hoặc thiếu trường là 400', async () => {
    const id = await seedApplication();

    await put(id, { interviewAt: '20/10/2026' }).expect(400);
    await put(id, {}).expect(400);
  });

  test('không sửa được đơn của người khác', async () => {
    const other = await harness.signUp();
    const id = await seedApplication(other);

    await put(id, { interviewAt: '2026-10-20T02:00:00Z' }).expect(404);

    const row = await harness.prisma.application.findUniqueOrThrow({
      where: { id },
    });
    expect(row.interviewAt).toBeNull();
  });
});
