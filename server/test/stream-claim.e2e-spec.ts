import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/**
 * Hai lượt cùng chạy trên một bản ghi, và lỗi trước sự kiện đầu tiên của stream.
 *
 * - Gọi `generate-stream` trên CV đã DONE (có thể đã sửa tay) từng ghi đè `content`
 *   và tốn một lượt model. Nay bị từ chối 409 trước khi gọi model.
 * - Stream ném `HttpException` trước sự kiện đầu từng thành HTTP 200 rồi đứt kết
 *   nối, giao diện chỉ thấy "Kết nối đứt giữa chừng". Nay là một sự kiện `error`
 *   mang câu lỗi và `statusCode`, rồi luồng đóng bình thường. Mã HTTP vẫn là 201
 *   mặc định của POST vì header đã gửi trước khi generator chạy.
 */
type StreamEvent = {
  type: string;
  message?: string;
  statusCode?: number;
  failureKind?: string;
};

const eventsOf = (text: string): StreamEvent[] =>
  text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StreamEvent);

const CV_CONTENT = {
  profileStatement: 'Câu giới thiệu người dùng đã tự sửa.',
  coreCompetencies: ['Hạch toán chứng từ', 'Đối chiếu công nợ', 'Lập báo cáo'],
  experiences: [],
  educations: [],
  skillGroups: [],
};

describe('Giành chỗ có điều kiện và lỗi trước sự kiện đầu của stream', () => {
  let harness: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
  });

  const post = (path: string, who: TestUser = user) =>
    request(harness.server)
      .post(path)
      .set('Authorization', `Bearer ${who.token}`);

  describe('POST /documents/:id/generate-stream', () => {
    const seedCv = (status: 'DONE' | 'RUNNING') =>
      harness.prisma.document.create({
        data: {
          userId: user.id,
          kind: 'CV',
          title: 'CV tổng quát',
          status,
          content: CV_CONTENT,
        },
      });

    test('CV đã DONE thì sự kiện error 409, content giữ nguyên, không gọi model', async () => {
      const document = await seedCv('DONE');
      const before = await harness.prisma.document.findUniqueOrThrow({
        where: { id: document.id },
      });

      const response = await post(
        `/api/documents/${document.id}/generate-stream`,
      ).expect(201);

      expect(eventsOf(response.text)).toEqual([
        expect.objectContaining({ type: 'error', statusCode: 409 }),
      ]);
      expect(eventsOf(response.text)[0].message).toContain('DONE');

      const after = await harness.prisma.document.findUniqueOrThrow({
        where: { id: document.id },
      });
      expect(after.status).toBe('DONE');
      expect(after.content).toEqual(before.content);
      expect(after.updatedAt).toEqual(before.updatedAt);
      expect(harness.ai.calls).toHaveLength(0);
    });

    test('đang RUNNING (bấm hai lần) thì lượt thứ hai 409, không chạy model song song', async () => {
      const document = await seedCv('RUNNING');

      const response = await post(
        `/api/documents/${document.id}/generate-stream`,
      ).expect(201);

      expect(eventsOf(response.text)).toEqual([
        expect.objectContaining({ type: 'error', statusCode: 409 }),
      ]);
      expect(harness.ai.calls).toHaveLength(0);
    });

    test('tài liệu không tồn tại thì sự kiện error 404 thay vì 200 rồi đứt kết nối', async () => {
      const response = await post(
        '/api/documents/khong-co-tai-lieu-nay/generate-stream',
      ).expect(201);

      expect(eventsOf(response.text)).toEqual([
        {
          type: 'error',
          statusCode: 404,
          message: 'Không tìm thấy tài liệu: khong-co-tai-lieu-nay',
        },
      ]);
    });

    test('tài liệu của người khác cũng là 404, không lộ là 409', async () => {
      const document = await seedCv('DONE');
      const attacker = await harness.signUp();

      const response = await post(
        `/api/documents/${document.id}/generate-stream`,
        attacker,
      ).expect(201);

      expect(eventsOf(response.text)).toEqual([
        expect.objectContaining({ type: 'error', statusCode: 404 }),
      ]);
    });
  });

  describe('POST /profile-drafts/:id/synthesize-stream', () => {
    test('bản nháp đã DONE thì sự kiện error 409, proposal giữ nguyên', async () => {
      const draft = await harness.prisma.profileDraft.create({
        data: {
          userId: user.id,
          status: 'DONE',
          evidence: [],
          proposal: { headline: 'Kế toán tổng hợp' },
        },
      });

      const response = await post(
        `/api/profile-drafts/${draft.id}/synthesize-stream`,
      ).expect(201);

      expect(eventsOf(response.text)).toEqual([
        expect.objectContaining({ type: 'error', statusCode: 409 }),
      ]);
      const after = await harness.prisma.profileDraft.findUniqueOrThrow({
        where: { id: draft.id },
      });
      expect(after.status).toBe('DONE');
      expect(after.proposal).toEqual({ headline: 'Kế toán tổng hợp' });
      expect(harness.ai.calls).toHaveLength(0);
    });
  });

  describe('lỗi AI trên route đồng bộ', () => {
    test('hết giờ khi gọi model thành 504 kèm failureKind, câu tiếng Việt, không lộ lỗi thô', async () => {
      const job = await harness.prisma.job.create({
        data: {
          source: 'test',
          externalId: 'tin-loi-ai',
          url: 'https://example.test/tin-loi-ai',
          title: 'Backend Developer',
          company: 'Công ty Thử Nghiệm',
          description: 'Tuyển Backend Developer biết NestJS.',
          tags: [],
        },
      });
      await harness.prisma.interviewPrep.create({
        data: {
          userId: user.id,
          jobId: job.id,
          status: 'DONE',
          starAnswers: [
            {
              competency: 'Giải quyết vấn đề',
              question: 'Kể về một lần bạn tối ưu hệ thống?',
              situation: 'API chậm.',
              task: 'Tối ưu truy vấn.',
              action: 'Thêm index.',
              result: 'Nhanh hơn 60%.',
            },
          ],
          toughQuestions: [],
        },
      });
      const timeout = new Error('The operation was aborted due to timeout');
      timeout.name = 'TimeoutError';
      harness.ai.willFail(timeout);

      const response = await post(
        `/api/interview/${job.id}/answers/star/0/feedback`,
      )
        .send({
          text: 'Năm ngoái API thanh toán chậm, tôi thêm index nên phản hồi nhanh hơn nhiều.',
        })
        .expect(504);

      expect(response.body).toMatchObject({
        statusCode: 504,
        failureKind: 'TIMEOUT',
      });
      const body = response.body as { message: string };
      expect(body.message).toContain('Quá thời gian chờ');
      expect(body.message).not.toContain('aborted');
    });
  });
});
