import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/// Vòng đời đơn ứng tuyển qua HTTP.
///
/// Trước tệp này, `PATCH /applications/:id/status` chưa có test nào - và giao diện
/// vừa được nối vào đúng endpoint đó. Ba quy tắc chuyển trạng thái ở
/// `transitions.ts` là hợp đồng mà màn hình Lịch sử ứng tuyển dựa vào để biết khi
/// nào phải hiện lý do từ chối, nên chúng cần được khoá lại ở tầng HTTP chứ không
/// chỉ ở test hàm thuần.
describe('Vòng đời đơn ứng tuyển', () => {
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
        externalId: 'tin-don',
        url: 'https://example.test/tin-don',
        title: 'Backend Developer',
        company: 'Công ty Thử Nghiệm',
        description:
          'Tuyển Backend Developer biết NestJS và PostgreSQL, tối thiểu hai năm kinh nghiệm.',
        tags: ['NestJS'],
      },
    });
    jobId = job.id;
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /// Tạo đơn đi đường tắt qua Prisma: đường HTTP đòi phải có kết quả chấm điểm
  /// DONE và không FAIL, mà việc đó thuộc phạm vi test của matching. Ở đây quan
  /// tâm tới chuyển trạng thái.
  const seedApplication = async (
    status: 'VIEWED' | 'APPLIED' | 'WITHDRAWN' = 'APPLIED',
    owner: TestUser = user,
  ) => {
    const application = await harness.prisma.application.create({
      data: {
        userId: owner.id,
        jobId,
        status,
        events: { create: { toStatus: status } },
      },
    });
    return application.id;
  };

  const patchStatus = (id: string, status: string, token = user.token) =>
    request(harness.server)
      .put(`/api/applications/${id}/status`)
      .set(auth(token))
      .send({ status });

  describe('chuyển trạng thái hợp lệ', () => {
    test('VIEWED sang APPLIED được chấp nhận', async () => {
      const id = await seedApplication('VIEWED');

      const response = await patchStatus(id, 'APPLIED').expect(200);

      expect((response.body as { status: string }).status).toBe('APPLIED');
    });

    test('ngày nộp được ghi ở lần chuyển sang APPLIED đầu tiên', async () => {
      const id = await seedApplication('VIEWED');

      const response = await patchStatus(id, 'APPLIED').expect(200);

      expect(
        (response.body as { appliedAt: string | null }).appliedAt,
      ).not.toBeNull();
    });

    test('response chỉ kèm phần tin để vẽ dòng, KHÔNG kèm mô tả hay nhật ký', async () => {
      const id = await seedApplication('VIEWED');

      const response = await patchStatus(id, 'APPLIED').expect(200);
      const body = response.body as { job: Record<string, unknown> };

      expect(Object.keys(body.job).sort()).toEqual([
        'company',
        'companyLogo',
        'id',
        'location',
        'salaryRaw',
        'title',
        'url',
      ]);
      expect(body).not.toHaveProperty('events');
    });

    test('mỗi lần đổi đều ghi một sự kiện vào nhật ký', async () => {
      const id = await seedApplication('APPLIED');

      await patchStatus(id, 'WITHDRAWN').expect(200);

      const events = await harness.prisma.applicationEvent.findMany({
        where: { applicationId: id },
        orderBy: { createdAt: 'asc' },
      });
      expect(events.map((e) => e.toStatus)).toEqual(['APPLIED', 'WITHDRAWN']);
    });
  });

  /// Hai lần đổi cùng lúc từng cùng đọc VIEWED rồi cùng ghi sự kiện
  /// `fromStatus: VIEWED`, nên nhật ký nói đơn đi hai nhánh từ một chỗ. Nay
  /// người đến sau hoặc nhận 409, hoặc đổi từ trạng thái người trước để lại.
  test('hai lần đổi trạng thái cùng lúc không ghi hai sự kiện từ cùng một trạng thái', async () => {
    const id = await seedApplication('VIEWED');

    const responses = await Promise.all([
      patchStatus(id, 'APPLIED'),
      patchStatus(id, 'WITHDRAWN'),
    ]);
    const codes = responses.map((response) => response.status);

    for (const code of codes) expect([200, 409]).toContain(code);
    expect(codes).toContain(200);

    const events = await harness.prisma.applicationEvent.findMany({
      where: { applicationId: id, fromStatus: { not: null } },
    });
    expect(events).toHaveLength(codes.filter((code) => code === 200).length);
    const froms = events.map((event) => event.fromStatus);
    expect(new Set(froms).size).toBe(froms.length);
  });

  describe('ba quy tắc mà backend thực sự chặn', () => {
    test('đổi sang chính trạng thái đang có bị từ chối', async () => {
      const id = await seedApplication('APPLIED');

      await patchStatus(id, 'APPLIED').expect(400);
    });

    /// Quy tắc 3 nhìn từ phía người dùng: họ ĐƯỢC mở lại đơn đã đóng. Chỉ nguồn
    /// tự động mới bị chặn, mà đường HTTP luôn là người dùng.
    test('người dùng mở lại được đơn đã đóng', async () => {
      const id = await seedApplication('APPLIED');
      await patchStatus(id, 'WITHDRAWN').expect(200);

      await patchStatus(id, 'APPLIED').expect(200);
    });

    test('mở lại đơn đã đóng thì xoá ngày đóng', async () => {
      const id = await seedApplication('APPLIED');
      await patchStatus(id, 'WITHDRAWN').expect(200);

      const response = await patchStatus(id, 'APPLIED').expect(200);

      expect(
        (response.body as { closedAt: string | null }).closedAt,
      ).toBeNull();
    });
  });

  describe('cách ly giữa hai người dùng', () => {
    test('không đổi được trạng thái đơn của người khác', async () => {
      const attacker = await harness.signUp();
      const id = await seedApplication('APPLIED');

      await patchStatus(id, 'WITHDRAWN', attacker.token).expect(404);

      // Và đơn vẫn nguyên trạng.
      const stored = await harness.prisma.application.findUniqueOrThrow({
        where: { id },
      });
      expect(stored.status).toBe('APPLIED');
    });

    test('danh sách đơn chỉ kèm CV của chính mình, dù cùng một tin', async () => {
      const other = await harness.signUp();
      await seedApplication('APPLIED');
      await seedApplication('APPLIED', other);
      for (const owner of [user, other]) {
        await harness.prisma.document.create({
          data: {
            userId: owner.id,
            jobId,
            kind: 'CV',
            title: `CV của ${owner.id}`,
          },
        });
      }

      const response = await request(harness.server)
        .get('/api/applications')
        .set(auth(user.token))
        .expect(200);

      const items = (
        response.body as {
          items: Array<{ documents: Array<{ title: string }> }>;
        }
      ).items;
      expect(items).toHaveLength(1);
      expect(items[0].documents.map((doc) => doc.title)).toEqual([
        `CV của ${user.id}`,
      ]);
    });

    test('chưa đăng nhập thì không đổi được gì', async () => {
      const id = await seedApplication('APPLIED');

      await request(harness.server)
        .put(`/api/applications/${id}/status`)
        .send({ status: 'WITHDRAWN' })
        .expect(401);
    });
  });

  describe('GET /applications/jobs', () => {
    const jobsOf = async (
      query: Record<string, string>,
      token = user.token,
    ) => {
      const response = await request(harness.server)
        .get('/api/applications/jobs')
        .query(query)
        .set(auth(token))
        .expect(200);
      return response.body as unknown[];
    };

    test('chỉ trả tên tin, công ty và logo của đơn đúng trạng thái', async () => {
      await seedApplication('APPLIED');

      expect(await jobsOf({ status: 'APPLIED' })).toEqual([
        {
          jobId,
          title: 'Backend Developer',
          company: 'Công ty Thử Nghiệm',
          companyLogo: null,
        },
      ]);
      expect(await jobsOf({ status: 'VIEWED' })).toEqual([]);
    });

    test('không thấy đơn của người khác', async () => {
      const other = await harness.signUp();
      await seedApplication('APPLIED', other);

      expect(await jobsOf({ status: 'APPLIED' })).toEqual([]);
    });

    test('trạng thái lạ nhận 400', async () => {
      await request(harness.server)
        .get('/api/applications/jobs')
        .query({ status: 'HIRED' })
        .set(auth(user.token))
        .expect(400);
    });
  });

  describe('kiểm tra đầu vào', () => {
    test('trạng thái không có trong enum bị từ chối', async () => {
      const id = await seedApplication('APPLIED');

      await patchStatus(id, 'KHONG_TON_TAI').expect(400);
    });

    test('trường lạ trong body bị từ chối', async () => {
      const id = await seedApplication('APPLIED');

      await request(harness.server)
        .put(`/api/applications/${id}/status`)
        .set(auth(user.token))
        .send({ status: 'WITHDRAWN', userId: 'ai-do-khac' })
        .expect(400);
    });
  });
});
