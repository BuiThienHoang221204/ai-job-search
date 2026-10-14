import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

describe('GET /dashboard/skill-gaps', () => {
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

  const gapsOf = async (who: TestUser) => {
    const response = await request(harness.server)
      .get('/api/dashboard/skill-gaps')
      .set({ Authorization: `Bearer ${who.token}` })
      .expect(200);
    return response.body as { skill: string; jobCount: number }[];
  };

  const seedItJobs = async (skills: string[][]) => {
    for (const [index, requiredSkills] of skills.entries()) {
      const job = await harness.prisma.job.create({
        data: {
          source: 'test',
          externalId: `tin-${index}`,
          url: `https://example.test/tin-${index}`,
          title: `Backend Developer ${index}`,
          company: `Công ty ${index}`,
          description: 'Mô tả đủ dài để qua được kiểm tra đầu vào của DTO.',
          occupationCode: 'IT',
          subOccupationCode: 'IT_BACKEND',
          tags: [],
        },
      });
      await harness.prisma.jobRequirement.create({
        data: { jobId: job.id, status: 'DONE', requiredSkills },
      });
    }
  };

  test('hồ sơ chưa có ngành thì không có gì để gợi ý', async () => {
    await seedItJobs([['GraphQL'], ['GraphQL']]);
    expect(await gapsOf(user)).toEqual([]);
  });

  test('trả kỹ năng nhiều tin cùng ngành đòi mà hồ sơ chưa có, khớp với /dashboard', async () => {
    await seedItJobs([
      ['GraphQL', 'Node.js'],
      ['GraphQL', 'Node.js'],
    ]);
    await harness.prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        occupationCode: 'IT',
        primarySkills: ['Node.js'],
      },
      update: { occupationCode: 'IT', primarySkills: ['Node.js'] },
    });

    const gaps = await gapsOf(user);
    expect(gaps.map((gap) => gap.skill)).toEqual(['GraphQL']);

    const overview = await request(harness.server)
      .get('/api/dashboard')
      .set({ Authorization: `Bearer ${user.token}` })
      .expect(200);
    expect((overview.body as { skillGaps: unknown }).skillGaps).toEqual(gaps);
  });

  test('mỗi người chỉ thấy khoảng trống theo hồ sơ của chính mình', async () => {
    await seedItJobs([['GraphQL'], ['GraphQL']]);
    await harness.prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, occupationCode: 'IT' },
      update: { occupationCode: 'IT' },
    });
    const other = await harness.signUp();

    expect((await gapsOf(user)).map((gap) => gap.skill)).toEqual(['GraphQL']);
    expect(await gapsOf(other)).toEqual([]);
  });

  test('việc đang chờ chỉ trả các trường thẻ tin cần, KHÔNG kèm ghi chú chấm điểm', async () => {
    await seedItJobs([['GraphQL']]);
    const job = await harness.prisma.job.findFirstOrThrow();
    await harness.prisma.jobMatch.create({
      data: {
        userId: user.id,
        jobId: job.id,
        status: 'DONE',
        eligibility: 'PASS',
        overallScore: 80,
        strengths: ['Node.js'],
        technicalNote: 'ghi chú dài',
        promptHash: 'hash',
      },
    });

    const overview = await request(harness.server)
      .get('/api/dashboard')
      .set({ Authorization: `Bearer ${user.token}` })
      .expect(200);
    const [match] = (
      overview.body as { pendingMatches: Record<string, unknown>[] }
    ).pendingMatches;

    expect(Object.keys(match).sort()).toEqual([
      'job',
      'jobId',
      'overallScore',
      'status',
      'strengths',
    ]);
    expect(match.job).toMatchObject({ id: job.id, saved: false });
  });
});
