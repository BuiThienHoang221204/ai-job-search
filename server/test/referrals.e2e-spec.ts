import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

type Summary = {
  code: string;
  joined: number;
  pending: number;
  bonusMinutesLeft: number;
};

describe('Mời bạn bè', () => {
  let harness: TestApp;
  let inviter: TestUser;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    inviter = await harness.signUp();
  });

  const auth = (who: TestUser) => ({ Authorization: `Bearer ${who.token}` });

  const summary = async (who: TestUser) =>
    (
      await request(harness.server)
        .get('/api/referrals')
        .set(auth(who))
        .expect(200)
    ).body as Summary;

  const chooseOccupation = (who: TestUser) =>
    request(harness.server)
      .post('/api/profile/quick-start')
      .set(auth(who))
      .send({
        occupationCode: 'IT',
        subOccupationCodes: [],
        preferredProvinces: [],
        experienceLevel: 'JUNIOR',
      })
      .expect(200);

  test('bạn đăng ký bằng mã rồi chọn ngành: cả hai được 15 phút, chọn lại ngành không thưởng lần nữa', async () => {
    const { code } = await summary(inviter);
    const friend = await harness.signUp(undefined, code.toLowerCase());

    expect(await summary(inviter)).toMatchObject({ joined: 0, pending: 1 });

    await chooseOccupation(friend);
    await chooseOccupation(friend);

    expect(await summary(inviter)).toMatchObject({
      joined: 1,
      pending: 0,
      bonusMinutesLeft: 15,
    });
    expect((await summary(friend)).bonusMinutesLeft).toBe(15);
  });

  test('hai lần mở thẻ cùng lúc nhận cùng một mã, mã không bị ghi đè', async () => {
    const [first, second] = await Promise.all([
      summary(inviter),
      summary(inviter),
    ]);

    expect(second.code).toBe(first.code);
    expect((await summary(inviter)).code).toBe(first.code);
  });

  test('mã lạ không chặn đăng ký và không ghi người mời', async () => {
    const stranger = await harness.signUp(undefined, 'KHONGCO1');

    const row = await harness.prisma.user.findUniqueOrThrow({
      where: { id: stranger.id },
      select: { referredById: true },
    });
    expect(row.referredById).toBeNull();
  });

  test('người mời chỉ được thưởng cho 10 bạn đầu tiên', async () => {
    const { code } = await summary(inviter);
    for (let index = 0; index < 11; index += 1) {
      await chooseOccupation(await harness.signUp(undefined, code));
    }

    expect(await summary(inviter)).toMatchObject({
      joined: 11,
      bonusMinutesLeft: 150,
    });
  });
});
