import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

type RewriteBody = {
  suggestions: Array<{ text: string; keywords: string[] }>;
  remaining: number;
};

describe('Gợi ý viết lại một gạch đầu dòng CV', () => {
  let harness: TestApp;
  let user: TestUser;
  let documentId: string;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
    await harness.prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, primarySkills: ['PostgreSQL', 'Redis'] },
      update: { primarySkills: ['PostgreSQL', 'Redis'] },
    });
    const job = await harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: 'tin-viet-lai',
        url: 'https://example.test/tin-viet-lai',
        title: 'Backend Developer',
        company: 'Công ty Thử Nghiệm',
        description: 'Tuyển Backend Developer biết PostgreSQL, Redis.',
        tags: [],
        requirements: {
          create: {
            status: 'DONE',
            requiredSkills: ['PostgreSQL', 'Microservices'],
            niceToHaveSkills: ['Redis'],
          },
        },
      },
    });
    const document = await harness.prisma.document.create({
      data: {
        userId: user.id,
        kind: 'CV',
        title: 'CV Backend',
        status: 'DONE',
        jobId: job.id,
      },
    });
    documentId = document.id;
  });

  const rewrite = (
    who: TestUser,
    text: string,
    kind = 'experience',
    id = documentId,
  ) =>
    request(harness.server)
      .post(`/api/documents/${id}/rewrite-bullet`)
      .set({ Authorization: `Bearer ${who.token}` })
      .send({ kind, text, context: 'Backend Developer tại ABC Tech' });

  test('trả gợi ý đã đục số bịa và bỏ gợi ý nhắc kỹ năng hồ sơ không có', async () => {
    harness.ai.willReturn({
      suggestions: [
        'Tối ưu truy vấn PostgreSQL và thêm Redis, giảm thời gian phản hồi 35%',
        'Tách hệ thống thành Microservices',
      ],
    });

    const response = await rewrite(user, 'Tham gia tối ưu hệ thống').expect(
      200,
    );
    const body = response.body as RewriteBody;

    expect(body).toEqual({
      suggestions: [
        {
          text: 'Tối ưu truy vấn PostgreSQL và thêm Redis, giảm thời gian phản hồi [__]%',
          keywords: ['PostgreSQL', 'Redis'],
        },
      ],
      remaining: 19,
    });
    expect(harness.ai.calls[0].purpose).toBe('document.bulletRewrite');
    expect(harness.ai.calls[0].userId).toBe(user.id);
  });

  test('đoạn Profile dùng prompt viết lại đoạn giới thiệu và giữ số năm đã có', async () => {
    harness.ai.willReturn({
      suggestions: [
        'Backend Developer với 2 năm kinh nghiệm PostgreSQL và Redis, nay có 5 năm làm sản phẩm fintech.',
      ],
    });

    const response = await rewrite(
      user,
      'Backend Developer với 2 năm kinh nghiệm xây dựng API.',
      'profile',
    ).expect(200);

    expect((response.body as RewriteBody).suggestions[0].text).toBe(
      'Backend Developer với 2 năm kinh nghiệm PostgreSQL và Redis, nay có [__] năm làm sản phẩm fintech.',
    );
    expect(harness.ai.calls[0].system).toContain('đoạn giới thiệu đầu CV');
  });

  test('CV của người khác là 404 và không gọi model', async () => {
    const other = await harness.signUp();

    await rewrite(other, 'Tham gia tối ưu hệ thống').expect(404);
    expect(harness.ai.calls).toHaveLength(0);
  });

  test('dòng quá ít ý bị từ chối trước khi gọi model', async () => {
    const response = await rewrite(user, 'Làm việc nhóm').expect(400);

    expect((response.body as { message: string }).message).toContain(
      'Thêm một ý cụ thể',
    );
    expect(harness.ai.calls).toHaveLength(0);
  });

  test('hết lượt trong 24 giờ là 429 và không gọi model', async () => {
    await harness.prisma.aiCall.createMany({
      data: Array.from({ length: 20 }, () => ({
        userId: user.id,
        purpose: 'document.bulletRewrite',
        provider: 'test',
        modelId: 'test',
        ok: true,
        durationMs: 1,
      })),
    });

    await rewrite(user, 'Tham gia tối ưu hệ thống').expect(429);
    expect(harness.ai.calls).toHaveLength(0);
  });
});
