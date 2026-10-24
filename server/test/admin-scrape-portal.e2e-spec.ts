import request from 'supertest';
import { JobSourceRouter } from 'src/modules/scraper/services/job-source.router.js';
import { createTestApp, type TestApp } from './support/app-harness.js';

describe('POST /admin/scrape/run-now/:portal · quét ngay một portal', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const admin = async () => {
    const user = await harness.signUp();
    await harness.promoteToAdmin(user.id);
    return { Authorization: `Bearer ${user.token}` };
  };

  test('admin quét một portal: lượt hệ thống (không gắn người dùng) vào hàng đợi, chỉ portal đó', async () => {
    const portal = harness.app.get(JobSourceRouter).listPortals()[0];

    const response = await request(harness.server)
      .post(`/api/admin/scrape/run-now/${portal}`)
      .set(await admin())
      .expect(202);

    const { runId } = response.body as { runId: string };
    const run = await harness.prisma.scrapeRun.findUniqueOrThrow({
      where: { id: runId },
    });
    expect(run).toMatchObject({ portal, userId: null, status: 'PENDING' });
    expect(harness.queue.sentTo('scrape.run')).toEqual([{ runId }]);
  });

  test('portal không có trong danh sách thì 400, không tạo lượt nào', async () => {
    await request(harness.server)
      .post('/api/admin/scrape/run-now/khong-ton-tai')
      .set(await admin())
      .expect(400);

    expect(await harness.prisma.scrapeRun.count()).toBe(0);
  });

  test('người dùng thường bị chặn', async () => {
    const user = await harness.signUp();
    const portal = harness.app.get(JobSourceRouter).listPortals()[0];

    await request(harness.server)
      .post(`/api/admin/scrape/run-now/${portal}`)
      .set({ Authorization: `Bearer ${user.token}` })
      .expect(403);
  });
});
