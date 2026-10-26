import { AiShortlistService } from 'src/modules/matching/rules/services/ai-shortlist.service.js';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/** Phát suất chấm AI chọn trong "Việc làm phù hợp" bằng truy vấn Prisma lồng quan hệ, nên kiểm trên Postgres thật. */
describe('AiShortlistService · chọn từ Việc làm phù hợp', () => {
  let harness: TestApp;
  let user: TestUser;
  let shortlist: AiShortlistService;
  const previousAuto = process.env.MATCH_AI_AUTO;
  const previousTopN = process.env.MATCH_AI_TOP_N;

  beforeAll(async () => {
    // ConfigModule đọc biến môi trường lúc dựng module, nên phải đặt TRƯỚC createTestApp.
    process.env.MATCH_AI_AUTO = 'true';
    // Trần mặc định 3 suất/người: 4 tin mà lấy 3 thì test có thể qua nhờ thứ tự chứ không nhờ cổng.
    process.env.MATCH_AI_TOP_N = '10';
    harness = await createTestApp();
    shortlist = harness.app.get(AiShortlistService);
  });

  afterAll(async () => {
    await harness.close();
    if (previousAuto === undefined) delete process.env.MATCH_AI_AUTO;
    else process.env.MATCH_AI_AUTO = previousAuto;
    if (previousTopN === undefined) delete process.env.MATCH_AI_TOP_N;
    else process.env.MATCH_AI_TOP_N = previousTopN;
  });

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
  });

  const seedJob = async (
    key: string,
    occupationCode: string | null,
    percent = 75,
    subOccupationCode: string | null = null,
  ) => {
    const job = await harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: key,
        url: `https://example.test/${key}`,
        title: `Tin ${key}`,
        company: 'Công ty',
        description: 'Mô tả đủ dài để qua được kiểm tra đầu vào.',
        tags: [],
        occupationCode,
        subOccupationCode,
        searchText: key,
      },
    });
    await harness.prisma.jobRequirementMatch.create({
      data: {
        userId: user.id,
        jobId: job.id,
        met: 3,
        total: 4,
        percent,
        rank: percent / 200,
        hash: `seed-${key}`,
      },
    });
    return job.id;
  };

  const dispatchedJobIds = async () => {
    await shortlist.dispatch(user.id);
    return (harness.queue.sentTo(QUEUE.EVALUATE_MATCH) as { jobId: string }[])
      .map((item) => item.jobId)
      .sort();
  };

  const setProfile = (
    occupationCode: string | null,
    subOccupationCodes: string[] = [],
  ) =>
    harness.prisma.profile.update({
      where: { userId: user.id },
      data: { occupationCode, subOccupationCodes, completion: 100 },
    });

  test('hồ sơ IT chỉ được phát suất cho tin đúng nhóm IT', async () => {
    await setProfile('IT');
    const it = await seedJob('it', 'IT');
    await seedJob('data', 'DATA_AI');
    await seedJob('other', 'OTHER');
    await seedJob('teacher', 'EDUCATION');

    expect(await dispatchedJobIds()).toEqual([it]);
  });

  test('hồ sơ chưa chọn ngành thì Việc làm phù hợp rỗng, nên không phát suất nào', async () => {
    await setProfile(null);
    await seedJob('it', 'IT');

    expect(await dispatchedJobIds()).toEqual([]);
  });

  test('chỉ lấy tin đúng nghề đã chọn, như trang Việc làm phù hợp', async () => {
    await setProfile('IT', ['IT_BACKEND']);
    const backend = await seedJob('backend', 'IT', 75, 'IT_BACKEND');
    await seedJob('devops', 'IT', 90, 'IT_DEVOPS');

    expect(await dispatchedJobIds()).toEqual([backend]);
  });

  test('bỏ tin dưới ngưỡng % khớp', async () => {
    await setProfile('IT');
    const enough = await seedJob('enough', 'IT', 50);
    await seedJob('weak', 'IT', 49);

    expect(await dispatchedJobIds()).toEqual([enough]);
  });

  test('tin chưa có mã ngành thì không được phát suất cho hồ sơ đã chọn ngành', async () => {
    await setProfile('IT');
    await seedJob('unknown', null);

    expect(await dispatchedJobIds()).toEqual([]);
  });
});
