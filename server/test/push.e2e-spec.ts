import request from 'supertest';
import { PushService } from 'src/modules/push/push.service.js';
import { StudyReminderService } from 'src/modules/upskill/services/study-reminder.service.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/thiet-bi-1';
const KEYS = { p256dh: 'khoa-p256dh', auth: 'khoa-auth' };

describe('Nhắc học bằng Web Push', () => {
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

  const auth = (who: TestUser) => ({ Authorization: `Bearer ${who.token}` });

  const subscribe = (who: TestUser, endpoint = ENDPOINT) =>
    request(harness.server)
      .post('/api/push/subscriptions')
      .set(auth(who))
      .send({ endpoint, keys: KEYS });

  describe('/push/subscriptions', () => {
    test('đăng ký rồi huỷ thiết bị của chính mình', async () => {
      await subscribe(user).expect(201);
      expect(await harness.prisma.pushSubscription.count()).toBe(1);

      const removed = await request(harness.server)
        .delete('/api/push/subscriptions')
        .set(auth(user))
        .send({ endpoint: ENDPOINT })
        .expect(200);
      expect(removed.body).toEqual({ removed: 1 });
      expect(await harness.prisma.pushSubscription.count()).toBe(0);
    });

    test('không huỷ được thiết bị của người khác', async () => {
      const other = await harness.signUp();
      await subscribe(other).expect(201);

      const removed = await request(harness.server)
        .delete('/api/push/subscriptions')
        .set(auth(user))
        .send({ endpoint: ENDPOINT })
        .expect(200);
      expect(removed.body).toEqual({ removed: 0 });
      expect(await harness.prisma.pushSubscription.count()).toBe(1);
    });

    test('cùng trình duyệt đăng nhập tài khoản khác thì thiết bị chuyển sang tài khoản đó', async () => {
      const other = await harness.signUp();
      await subscribe(other).expect(201);
      await subscribe(user).expect(201);

      const rows = await harness.prisma.pushSubscription.findMany();
      expect(rows.map((row) => row.userId)).toEqual([user.id]);
    });

    test('endpoint không phải https bị từ chối', async () => {
      await subscribe(user, 'http://example.test/push').expect(400);
    });

    test('máy chủ chưa đặt khoá VAPID thì không phát khoá công khai', async () => {
      await request(harness.server)
        .get('/api/push/public-key')
        .set(auth(user))
        .expect(503);
    });
  });

  describe('giờ học', () => {
    test('đổi giờ học, trang lộ trình trả lại giờ mới', async () => {
      await request(harness.server)
        .patch('/api/learning')
        .set(auth(user))
        .send({ studyTime: '21:30' })
        .expect(200);

      const overview = await request(harness.server)
        .get('/api/learning')
        .set(auth(user))
        .expect(200);
      expect((overview.body as { studyTime: string }).studyTime).toBe('21:30');
    });

    test('giờ ngoài 06:00-23:00 hoặc lệch bước 30 phút bị từ chối', async () => {
      for (const studyTime of ['05:30', '23:30', '20:15', 'abc']) {
        await request(harness.server)
          .patch('/api/learning')
          .set(auth(user))
          .send({ studyTime })
          .expect(400);
      }
    });
  });

  describe('chọn người cần nhắc', () => {
    const MONDAY_20_45_VN = new Date('2026-10-26T13:45:00Z');

    const learning = (
      who: TestUser,
      skillName: string,
      days: string[],
      status: 'LEARNING' | 'DONE' = 'LEARNING',
    ) =>
      harness.prisma.learningItem.create({
        data: {
          userId: who.id,
          skillKey: skillName.toLowerCase(),
          skillName,
          status,
          days,
        },
      });

    test('chỉ nhắc người có giờ học 21:00, học vào thứ Hai, kỹ năng chưa xong và đã bật nhắc', async () => {
      const send = jest
        .spyOn(harness.app.get(PushService), 'send')
        .mockResolvedValue(1);
      try {
        const wrongTime = await harness.signUp();
        const wrongDay = await harness.signUp();
        const finished = await harness.signUp();
        const noDevice = await harness.signUp();
        for (const who of [user, wrongTime, wrongDay, finished, noDevice]) {
          await harness.prisma.user.update({
            where: { id: who.id },
            data: { studyTime: who === wrongTime ? '20:00' : '21:00' },
          });
        }
        await learning(user, 'Microservices', ['MO', 'WE']);
        await learning(user, 'Python', ['MO']);
        await learning(user, 'Docker', ['TU']);
        await learning(wrongTime, 'Go', ['MO']);
        await learning(wrongDay, 'Rust', ['TU']);
        await learning(finished, 'Java', ['MO'], 'DONE');
        await learning(noDevice, 'Kotlin', ['MO']);
        for (const who of [user, wrongTime, wrongDay, finished]) {
          await subscribe(who, `${ENDPOINT}-${who.id}`).expect(201);
        }

        await harness.app.get(StudyReminderService).remind(MONDAY_20_45_VN);

        expect(send).toHaveBeenCalledTimes(1);
        const [targets, message] = send.mock.calls[0];
        expect(targets.map((target) => target.endpoint)).toEqual([
          `${ENDPOINT}-${user.id}`,
        ]);
        expect(message.body).toBe(
          'Hôm nay 21:00 học Microservices, Python. Mốc tiếp theo: học nền tảng Microservices.',
        );
      } finally {
        send.mockRestore();
      }
    });
  });
});
