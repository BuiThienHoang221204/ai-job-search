import request from 'supertest';
import { daysAgo } from 'src/common/duration.js';
import { RetentionService } from 'src/modules/reconcile/services/retention.service.js';
import { createTestApp, type TestApp } from './support/app-harness.js';

describe('Tài khoản và lưu giữ dữ liệu', () => {
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

  const aiCall = (userId: string | null, createdAt = new Date()) => ({
    userId,
    purpose: 'match.evaluate',
    provider: 'test',
    modelId: 'test-model',
    ok: true,
    durationMs: 100,
    createdAt,
  });

  test('đăng ký không đồng ý điều khoản trả 400; đồng ý thì lưu thời điểm đồng ý', async () => {
    const response = await request(harness.server)
      .post('/api/auth/register')
      .send({
        email: 'chua-dong-y@test.local',
        name: 'A',
        password: 'MatKhauTest123!',
      })
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('Điều khoản sử dụng');

    const user = await harness.signUp();
    const row = await harness.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(row.termsAcceptedAt).toBeInstanceOf(Date);
  });

  test('xoá tài khoản xoá hồ sơ, nhật ký AI và file của chính người gọi, không đụng người khác', async () => {
    const owner = await harness.signUp();
    const other = await harness.signUp();
    await harness.prisma.aiCall.createMany({
      data: [aiCall(owner.id), aiCall(other.id)],
    });
    harness.storage.files.set(
      `${owner.id}/cv-uploads/a/cv.pdf`,
      Buffer.from('a'),
    );
    harness.storage.files.set(`cv-tmp/${owner.id}/b.pdf`, Buffer.from('b'));
    harness.storage.files.set(
      `${other.id}/cv-uploads/c/cv.pdf`,
      Buffer.from('c'),
    );

    const response = await request(harness.server)
      .delete('/api/auth/account')
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(String(response.headers['set-cookie'])).toContain('aijob_token=;');

    expect(await harness.prisma.user.count({ where: { id: owner.id } })).toBe(
      0,
    );
    expect(
      await harness.prisma.profile.count({ where: { userId: owner.id } }),
    ).toBe(0);
    expect(
      await harness.prisma.aiCall.count({ where: { userId: owner.id } }),
    ).toBe(0);
    expect(
      await harness.prisma.aiCall.count({ where: { userId: other.id } }),
    ).toBe(1);
    expect([...harness.storage.files.keys()]).toEqual([
      `${other.id}/cv-uploads/c/cv.pdf`,
    ]);

    await request(harness.server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(401);
    await request(harness.server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
  });

  test('xoá tài khoản khi chưa đăng nhập trả 401', async () => {
    await request(harness.server).delete('/api/auth/account').expect(401);
  });

  test('dọn nhật ký AI và bộ đếm lượt của khách quá 90 ngày, giữ bản mới', async () => {
    await harness.prisma.aiCall.createMany({
      data: [aiCall(null, daysAgo(91)), aiCall(null, daysAgo(1))],
    });
    await harness.prisma.usageCounter.createMany({
      data: [
        { scope: 'cv-check-guest', key: 'cu', day: daysAgo(91), count: 1 },
        { scope: 'cv-check-guest', key: 'moi', day: daysAgo(1), count: 1 },
      ],
    });

    await harness.app.get(RetentionService).purge();

    expect(await harness.prisma.aiCall.count()).toBe(1);
    expect(
      (await harness.prisma.usageCounter.findMany()).map((row) => row.key),
    ).toEqual(['moi']);
  });
});
