import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/**
 * Hợp đồng của `GET /api/upskill` — "báo cáo đã hoàn thành mới nhất".
 *
 * Endpoint này trả **404 khi người dùng chưa có báo cáo nào**, và giao diện CỐ Ý
 * coi đó là trạng thái rỗng chứ không phải lỗi (`upskill-view.tsx`: "404 KHÔNG
 * phải lỗi"). Cách đó đúng REST cho một tài nguyên đơn, nhưng nó có một điểm mù
 * cần được ghim lại:
 *
 * Giao diện KHÔNG phân biệt được "chưa có báo cáo" với "route này không còn tồn
 * tại". Đổi tên route thành `/upskill/latest` chẳng hạn, thì giao diện vẫn nhận
 * 404 và sẽ mãi mãi hiện "chưa có báo cáo" — một tích hợp đã hỏng nhưng trông y
 * như một tài khoản mới. Không có test nào đỏ, không có lỗi nào hiện ra.
 *
 * Spec này đóng đúng khe đó: nó ghim CẢ đường dẫn lẫn hai hành vi. Đổi route đi
 * thì test đỏ ngay thay vì lặng lẽ biến màn hình thành trạng thái rỗng vĩnh viễn.
 *
 * Đánh đổi còn lại, đã biết và chấp nhận: mỗi lần mở màn Lộ trình học khi chưa có
 * báo cáo, console trình duyệt có một dòng 404. Đó là tiếng ồn, không phải lỗi.
 */
describe('Hợp đồng GET /api/upskill', () => {
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

  test('chưa có báo cáo thì 404, và route tồn tại đúng đường dẫn này', async () => {
    await request(harness.server)
      .get('/api/upskill')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);
  });

  test('có báo cáo DONE thì trả về chính báo cáo đó', async () => {
    const report = await harness.prisma.upskillReport.create({
      data: {
        userId: user.id,
        mode: 'AGGREGATE',
        status: 'DONE',
        jobsAnalysed: 12,
        summary: 'Thiếu Kubernetes và kiểm thử tự động.',
        hardGaps: [],
        synthesisedGaps: [],
        learningPlan: [],
        generatedAt: new Date(),
      },
    });

    const response = await request(harness.server)
      .get('/api/upskill')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const body = response.body as { id: string; jobsAnalysed: number };
    expect(body.id).toBe(report.id);
    expect(body.jobsAnalysed).toBe(12);
  });

  test('báo cáo đang chạy hoặc đã hỏng KHÔNG được coi là mới nhất', async () => {
    // Nếu chỗ này lọt, màn hình sẽ hiện một báo cáo rỗng với đủ khối trống thay
    // vì hiện "đang tạo..." hoặc thông báo hỏng.
    await harness.prisma.upskillReport.createMany({
      data: [
        { userId: user.id, mode: 'AGGREGATE', status: 'RUNNING' },
        {
          userId: user.id,
          mode: 'AGGREGATE',
          status: 'FAILED',
          error: 'timeout',
        },
      ],
    });

    await request(harness.server)
      .get('/api/upskill')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);
  });

  test('không đọc được báo cáo của người khác', async () => {
    const other = await harness.signUp();
    const report = await harness.prisma.upskillReport.create({
      data: {
        userId: other.id,
        mode: 'AGGREGATE',
        status: 'DONE',
        generatedAt: new Date(),
      },
    });

    await request(harness.server)
      .get(`/api/upskill/${report.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);
  });
});
