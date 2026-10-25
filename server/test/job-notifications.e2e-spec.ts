import request from 'supertest';
import { DAY_MS, HOUR_MS } from 'src/common/duration.js';
import { JobAlertService } from 'src/modules/jobs/job-alert.service.js';
import { PushService } from 'src/modules/push/push.service.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

const KEYS = { p256dh: 'khoa-p256dh', auth: 'khoa-auth' };

describe('Báo tin mới mỗi sáng', () => {
  let harness: TestApp;
  let user: TestUser;
  let send: jest.SpiedFunction<PushService['send']>;
  let jobCounter = 0;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
    send = jest
      .spyOn(harness.app.get(PushService), 'send')
      .mockResolvedValue(1);
  });

  afterEach(() => {
    send.mockRestore();
  });

  const auth = (who: TestUser) => ({ Authorization: `Bearer ${who.token}` });

  const optIn = async (who: TestUser) => {
    await request(harness.server)
      .post('/api/push/subscriptions')
      .set(auth(who))
      .send({
        endpoint: `https://fcm.googleapis.com/fcm/send/${who.id}`,
        keys: KEYS,
      })
      .expect(201);
    await harness.prisma.profile.update({
      where: { userId: who.id },
      data: { occupationCode: 'IT' },
    });
    await request(harness.server)
      .patch('/api/push/preferences')
      .set(auth(who))
      .send({ jobNotifications: true })
      .expect(200);
  };

  const job = (title: string, occupationCode: string, scrapedAt: Date) => {
    jobCounter += 1;
    return harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: `tin-${jobCounter}`,
        url: `https://example.test/tin-${jobCounter}`,
        title,
        company: 'Công ty Thử Nghiệm',
        description: 'Mô tả',
        tags: [],
        occupationCode,
        scrapedAt,
      },
    });
  };

  describe('báo tin mới', () => {
    test('gửi một lần trong ngày, chỉ đếm tin mới qua "Việc làm phù hợp"; lần sau chỉ tính tin từ lần báo trước', async () => {
      const now = new Date();
      await optIn(user);
      await job('Backend Developer', 'IT', new Date(now.getTime() - HOUR_MS));
      await job(
        'Nhân viên kinh doanh',
        'SALES',
        new Date(now.getTime() - HOUR_MS),
      );
      const alerts = harness.app.get(JobAlertService);

      await alerts.alert(now);
      await alerts.alert(now);

      expect(send).toHaveBeenCalledTimes(1);
      const [, message] = send.mock.calls[0];
      expect(message.body).toBe(
        '1 tin mới hợp với bạn: Backend Developer · Công ty Thử Nghiệm.',
      );
      expect(message.url).toContain('/dashboard/jobs?scored=1&since=');

      await alerts.alert(new Date(now.getTime() + DAY_MS));
      expect(send).toHaveBeenCalledTimes(1);
    });

    test('chưa bật thông báo tìm việc thì không gửi', async () => {
      await optIn(user);
      await request(harness.server)
        .patch('/api/push/preferences')
        .set(auth(user))
        .send({ jobNotifications: false })
        .expect(200);
      await job('Backend Developer', 'IT', new Date(Date.now() - HOUR_MS));

      await harness.app.get(JobAlertService).alert(new Date());

      expect(send).not.toHaveBeenCalled();
    });
  });

  test('danh sách nhận ?since= chỉ trả tin quét sau mốc đó (link trong thông báo)', async () => {
    await harness.prisma.profile.update({
      where: { userId: user.id },
      data: { occupationCode: 'IT' },
    });
    const since = new Date(Date.now() - 2 * HOUR_MS);
    await job('Tin cũ', 'IT', new Date(since.getTime() - HOUR_MS));
    await job('Tin mới', 'IT', new Date(since.getTime() + HOUR_MS));

    const response = await request(harness.server)
      .get('/api/jobs')
      .query({ scored: 'true', since: since.toISOString() })
      .set(auth(user))
      .expect(200);

    const titles = (response.body as { items: { title: string }[] }).items.map(
      (item) => item.title,
    );
    expect(titles).toEqual(['Tin mới']);
  });

  test('mặc định nhắc học bật, thông báo tìm việc tắt; tắt loại này giữ nguyên loại kia', async () => {
    const before = await request(harness.server)
      .get('/api/push/preferences')
      .set(auth(user))
      .expect(200);
    expect(before.body).toEqual({
      jobNotifications: false,
      studyReminders: true,
    });

    await request(harness.server)
      .patch('/api/push/preferences')
      .set(auth(user))
      .send({ jobNotifications: true })
      .expect(200);
    const after = await request(harness.server)
      .patch('/api/push/preferences')
      .set(auth(user))
      .send({ studyReminders: false })
      .expect(200);
    expect(after.body).toEqual({
      jobNotifications: true,
      studyReminders: false,
    });

    await request(harness.server)
      .patch('/api/push/preferences')
      .set(auth(user))
      .send({ jobNotifications: 'có' })
      .expect(400);
    await request(harness.server)
      .patch('/api/push/preferences')
      .set(auth(user))
      .send({})
      .expect(400);
  });
});
