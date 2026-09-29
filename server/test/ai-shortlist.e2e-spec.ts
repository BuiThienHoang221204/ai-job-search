import { AiShortlistService } from 'src/modules/matching/rules/services/ai-shortlist.service.js';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/** Phát suất chấm AI chọn tin bằng SQL thô, nên cổng ngành phải kiểm trên Postgres thật chứ không kiểm được bằng unit test. */
describe('AiShortlistService · cổng ngành', () => {
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

  const seedJob = async (key: string, occupationCode: string | null) => {
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
        searchText: key,
      },
    });
    await harness.prisma.jobRequirementMatch.create({
      data: {
        userId: user.id,
        jobId: job.id,
        met: 3,
        total: 4,
        percent: 75,
        rank: 0.5,
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

  const setProfile = (occupationCode: string | null) =>
    harness.prisma.profile.update({
      where: { userId: user.id },
      data: { occupationCode, completion: 100 },
    });

  test('hồ sơ IT không được phát suất cho tin EDUCATION', async () => {
    await setProfile('IT');
    const it = await seedJob('it', 'IT');
    const data = await seedJob('data', 'DATA_AI');
    const other = await seedJob('other', 'OTHER');
    await seedJob('teacher', 'EDUCATION');

    expect(await dispatchedJobIds()).toEqual([it, data, other].sort());
  });

  test('hồ sơ chưa rõ ngành thì không chặn gì', async () => {
    await setProfile(null);
    const it = await seedJob('it', 'IT');
    const teacher = await seedJob('teacher', 'EDUCATION');

    expect(await dispatchedJobIds()).toEqual([it, teacher].sort());
  });

  test('tin chưa có mã ngành thì không có căn cứ để loại', async () => {
    await setProfile('IT');
    const unknown = await seedJob('unknown', null);

    expect(await dispatchedJobIds()).toEqual([unknown]);
  });
});
