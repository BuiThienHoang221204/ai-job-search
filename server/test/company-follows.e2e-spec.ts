import request from 'supertest';
import { companyKeyOf } from 'src/modules/companies/utils/company-key.js';
import { JobAlertService } from 'src/modules/jobs/job-alert.service.js';
import { PushService } from 'src/modules/push/push.service.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

describe('Theo dõi công ty', () => {
  let harness: TestApp;
  let user: TestUser;
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
  });

  const auth = (who: TestUser) => ({ Authorization: `Bearer ${who.token}` });

  const job = (
    company: string,
    occupationCode: string,
    scrapedAt = new Date(),
  ) => {
    jobCounter += 1;
    return harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: `cong-ty-${jobCounter}`,
        url: `https://example.test/cong-ty-${jobCounter}`,
        title: `Tin ${jobCounter}`,
        company,
        companyKey: companyKeyOf(company),
        description: 'Mô tả',
        tags: [],
        occupationCode,
        scrapedAt,
      },
    });
  };

  const follow = (who: TestUser, jobId: string) =>
    request(harness.server)
      .post('/api/companies/follows')
      .set(auth(who))
      .send({ jobId });

  test('theo dõi theo tên đã chuẩn hoá, bấm lại không tạo bản trùng, chỉ chủ mới bỏ được', async () => {
    const first = await job('Công ty TNHH Nexa', 'IT');
    const sameCompany = await job('NEXA', 'FINANCE');

    const created = (await follow(user, first.id).expect(201)).body as {
      id: string;
    };
    await follow(user, sameCompany.id).expect(201);
    const list = await request(harness.server)
      .get('/api/companies/follows')
      .set(auth(user))
      .expect(200);
    expect(list.body).toEqual([
      { id: created.id, companyKey: 'nexa', name: 'Công ty TNHH Nexa' },
    ]);

    const other = await harness.signUp();
    await request(harness.server)
      .delete(`/api/companies/follows/${created.id}`)
      .set(auth(other))
      .expect(404);
    await request(harness.server)
      .delete(`/api/companies/follows/${created.id}`)
      .set(auth(user))
      .expect(200);
  });

  test('tin không ghi tên công ty thì không theo dõi được', async () => {
    const hidden = await job('Không rõ', 'IT');

    const response = await follow(user, hidden.id).expect(400);
    expect((response.body as { message: string }).message).toBe(
      'Tin này không ghi tên công ty nên chưa theo dõi được.',
    );
  });

  test('?followed=true chỉ trả tin của công ty đang theo dõi, kể cả khác ngành', async () => {
    const nexa = await job('Nexa', 'FINANCE');
    await job('OTS', 'IT');
    await follow(user, nexa.id).expect(201);

    const response = await request(harness.server)
      .get('/api/jobs')
      .query({ followed: true })
      .set(auth(user))
      .expect(200);
    const items = (response.body as { items: { id: string }[] }).items;
    expect(items.map((item) => item.id)).toEqual([nexa.id]);
  });

  test('thông báo 07:30 gộp tin mới của công ty theo dõi, dù hồ sơ chưa chọn ngành', async () => {
    const send = jest
      .spyOn(harness.app.get(PushService), 'send')
      .mockResolvedValue(1);
    try {
      await request(harness.server)
        .post('/api/push/subscriptions')
        .set(auth(user))
        .send({
          endpoint: `https://fcm.googleapis.com/fcm/send/${user.id}`,
          keys: { p256dh: 'khoa-p256dh', auth: 'khoa-auth' },
        })
        .expect(201);
      await request(harness.server)
        .patch('/api/push/preferences')
        .set(auth(user))
        .send({ jobNotifications: true })
        .expect(200);
      const nexa = await job('Nexa', 'FINANCE');
      await follow(user, nexa.id).expect(201);
      await job('Nexa', 'FINANCE');

      await harness.app.get(JobAlertService).alert(new Date());

      expect(send).toHaveBeenCalledTimes(1);
      const [, message] = send.mock.calls[0];
      expect(message.body).toBe('Công ty bạn theo dõi: 2 tin mới từ Nexa.');
      expect(message.url).toMatch(/^\/dashboard\/jobs\?followed=1&since=/);
    } finally {
      send.mockRestore();
    }
  });
});
