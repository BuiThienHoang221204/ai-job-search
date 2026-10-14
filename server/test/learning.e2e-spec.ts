import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

type Gap = {
  key: string;
  name: string;
  demand: number;
  near: number;
  status: string;
};
type Overview = {
  needsOccupation: boolean;
  subOccupationNames: string[];
  jobsAnalysed: number;
  gaps: Gap[];
  plan: { skillKey: string; status: string; steps: boolean[] }[];
  skipped: { skillKey: string }[];
};

describe('Lộ trình học — /learning', () => {
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

  let seq = 0;
  const seedJob = async (
    requiredSkills: string[],
    seniority: 'JUNIOR' | 'LEAD' | 'UNKNOWN' = 'UNKNOWN',
    occupationCode = 'IT',
    subOccupationCode: string | null = 'IT_BACKEND',
  ) => {
    seq += 1;
    const job = await harness.prisma.job.create({
      data: {
        source: 'test',
        externalId: `tin-hoc-${seq}`,
        url: `https://example.test/tin-hoc-${seq}`,
        title: `Backend Developer ${seq}`,
        company: `Công ty ${seq}`,
        description: 'Mô tả đủ dài để qua được kiểm tra đầu vào của DTO.',
        occupationCode,
        subOccupationCode,
        tags: [],
      },
    });
    await harness.prisma.jobRequirement.create({
      data: { jobId: job.id, status: 'DONE', requiredSkills, seniority },
    });
  };

  const seedProfile = (
    who: TestUser,
    data: {
      headline?: string;
      primarySkills?: string[];
      experienceLevel?: 'JUNIOR';
    } = {},
  ) =>
    harness.prisma.profile.upsert({
      where: { userId: who.id },
      create: { userId: who.id, occupationCode: 'IT', ...data },
      update: { occupationCode: 'IT', ...data },
    });

  const overview = async (who: TestUser = user) =>
    (
      await request(harness.server)
        .get('/api/learning')
        .set(auth(who))
        .expect(200)
    ).body as Overview;

  const save = (key: string, body: object, who: TestUser = user) =>
    request(harness.server)
      .put(`/api/learning/${encodeURIComponent(key)}`)
      .set(auth(who))
      .send(body);

  test('hồ sơ chưa có ngành thì không đếm gì, báo cần chọn ngành', async () => {
    await seedJob(['GraphQL']);
    await seedJob(['GraphQL']);

    expect(await overview()).toMatchObject({
      needsOccupation: true,
      gaps: [],
    });
  });

  test('đếm kỹ năng còn thiếu và số tin gần đạt cần nó', async () => {
    await seedProfile(user, { primarySkills: ['Node.js'] });
    await seedJob(['Node.js', 'GraphQL']);
    await seedJob(['Node.js', 'GraphQL']);
    await seedJob(['GraphQL', 'Docker']);

    const result = await overview();

    expect(result.jobsAnalysed).toBe(3);
    expect(result.gaps).toEqual([
      expect.objectContaining({
        name: 'GraphQL',
        demand: 3,
        near: 2,
        status: 'OPEN',
      }),
    ]);
  });

  test('chỉ tính tin đúng ngành và cấp bậc lệch tối đa một bậc', async () => {
    await seedProfile(user, { experienceLevel: 'JUNIOR' });
    await seedJob(['GraphQL'], 'JUNIOR');
    await seedJob(['GraphQL'], 'UNKNOWN');
    await seedJob(['Kafka'], 'LEAD');
    await seedJob(['Kafka'], 'LEAD');
    await seedJob(['Excel'], 'UNKNOWN', 'FINANCE', null);
    await seedJob(['Excel'], 'UNKNOWN', 'FINANCE', null);

    const result = await overview();

    expect(result.jobsAnalysed).toBe(2);
    expect(result.gaps.map((gap) => gap.name)).toEqual(['GraphQL']);
  });

  test('hồ sơ có nghề thì chỉ tính tin đúng nghề và nghề gần', async () => {
    await seedProfile(user, { headline: 'Full Stack Developer' });
    await seedJob(['GraphQL'], 'UNKNOWN', 'IT', 'IT_FULLSTACK');
    await seedJob(['GraphQL'], 'UNKNOWN', 'IT', 'IT_BACKEND');
    await seedJob(['Selenium'], 'UNKNOWN', 'IT', 'IT_QA');
    await seedJob(['Selenium'], 'UNKNOWN', 'IT', 'IT_QA');
    await seedJob(['Selenium'], 'UNKNOWN', 'IT', null);

    const result = await overview();

    expect(result.jobsAnalysed).toBe(2);
    expect(result.subOccupationNames).toContain('Fullstack');
    expect(result.subOccupationNames).not.toContain('Kiểm thử / QA');
    expect(result.gaps.map((gap) => gap.name)).toEqual(['GraphQL']);
  });

  test('trang Tổng quan dùng đúng cách tính của trang Lộ trình học', async () => {
    await seedProfile(user, { primarySkills: ['Node.js'] });
    await seedJob(['Node.js', 'GraphQL']);
    await seedJob(['GraphQL', 'Docker']);
    await seedJob(['Docker']);

    const result = await overview();
    const dashboard = await request(harness.server)
      .get('/api/dashboard/skill-gaps')
      .set(auth(user))
      .expect(200);

    expect(dashboard.body).toEqual(
      result.gaps.map((gap) => ({ skill: gap.name, jobCount: gap.demand })),
    );
  });

  describe('kế hoạch học', () => {
    beforeEach(async () => {
      await seedProfile(user);
      for (const skill of ['GraphQL', 'Docker', 'AWS', 'Redis']) {
        await seedJob([skill]);
        await seedJob([skill]);
      }
    });

    const keyOf = async (name: string) =>
      (await overview()).gaps.find((gap) => gap.name === name)!.key;

    test('học một kỹ năng thì nó vào kế hoạch và trạng thái hiện ở danh sách', async () => {
      const key = await keyOf('GraphQL');

      await save(key, { skillName: 'GraphQL', status: 'LEARNING' }).expect(200);

      const result = await overview();
      expect(result.plan).toEqual([
        expect.objectContaining({ skillKey: key, status: 'LEARNING' }),
      ]);
      expect(result.gaps.find((gap) => gap.key === key)?.status).toBe(
        'LEARNING',
      );
    });

    test('tối đa 3 kỹ năng đang học; bỏ qua không tính vào giới hạn', async () => {
      for (const name of ['GraphQL', 'Docker', 'AWS']) {
        await save(await keyOf(name), {
          skillName: name,
          status: 'LEARNING',
        }).expect(200);
      }

      await save(await keyOf('Redis'), {
        skillName: 'Redis',
        status: 'LEARNING',
      }).expect(400);
      await save(await keyOf('Redis'), {
        skillName: 'Redis',
        status: 'SKIPPED',
      }).expect(200);

      expect((await overview()).skipped).toHaveLength(1);
    });

    test('xong đủ 3 mốc thì thành DONE, kỹ năng vào hồ sơ và rời danh sách thiếu', async () => {
      const key = await keyOf('Docker');

      const done = await save(key, {
        skillName: 'Docker',
        status: 'LEARNING',
        steps: [true, true, true],
        days: ['TU', 'TH'],
      }).expect(200);

      expect(done.body).toMatchObject({ status: 'DONE', days: ['TU', 'TH'] });
      const profile = await harness.prisma.profile.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(profile.secondarySkills).toContain('Docker');
      expect((await overview()).gaps.map((gap) => gap.name)).not.toContain(
        'Docker',
      );
    });

    test('ngày học lạ hoặc thiếu mốc bị từ chối', async () => {
      const key = await keyOf('AWS');

      await save(key, {
        skillName: 'AWS',
        status: 'LEARNING',
        days: ['Thứ hai'],
      }).expect(400);
      await save(key, {
        skillName: 'AWS',
        status: 'LEARNING',
        steps: [true],
      }).expect(400);
    });

    test('xoá thì kỹ năng quay lại trạng thái chưa chọn', async () => {
      const key = await keyOf('Redis');
      await save(key, { skillName: 'Redis', status: 'SKIPPED' }).expect(200);

      await request(harness.server)
        .delete(`/api/learning/${encodeURIComponent(key)}`)
        .set(auth(user))
        .expect(200);

      expect(
        (await overview()).gaps.find((gap) => gap.key === key)?.status,
      ).toBe('OPEN');
    });

    describe('quyền sở hữu', () => {
      test('không thấy và không xoá được kế hoạch của người khác', async () => {
        const key = await keyOf('GraphQL');
        await save(key, { skillName: 'GraphQL', status: 'LEARNING' }).expect(
          200,
        );
        const other = await harness.signUp();
        await seedProfile(other);

        expect((await overview(other)).plan).toEqual([]);
        const removed = await request(harness.server)
          .delete(`/api/learning/${encodeURIComponent(key)}`)
          .set(auth(other))
          .expect(200);

        expect(removed.body).toEqual({ removed: 0 });
        expect((await overview()).plan).toHaveLength(1);
      });

      test('giới hạn 3 kỹ năng tính riêng cho từng người', async () => {
        for (const name of ['GraphQL', 'Docker', 'AWS']) {
          await save(await keyOf(name), {
            skillName: name,
            status: 'LEARNING',
          }).expect(200);
        }
        const other = await harness.signUp();
        await seedProfile(other);

        await save(
          await keyOf('Redis'),
          { skillName: 'Redis', status: 'LEARNING' },
          other,
        ).expect(200);
      });
    });
  });
});

describe('POST /profile/skills', () => {
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
    await harness.prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, primarySkills: ['Node.js'] },
      update: { primarySkills: ['Node.js'], secondarySkills: [] },
    });
  });

  const add = (skill: string) =>
    request(harness.server)
      .post('/api/profile/skills')
      .set({ Authorization: `Bearer ${user.token}` })
      .send({ skill });

  test('thêm một kỹ năng, không đụng các kỹ năng đã có', async () => {
    const response = await add('GraphQL').expect(200);

    expect(response.body).toMatchObject({
      primarySkills: ['Node.js'],
      secondarySkills: ['GraphQL'],
    });
  });

  test('kỹ năng đã có (khác hoa thường) thì giữ nguyên', async () => {
    const response = await add('node.js').expect(200);

    expect(response.body).toMatchObject({
      primarySkills: ['Node.js'],
      secondarySkills: [],
    });
  });

  test('tên rỗng bị từ chối', async () => {
    await add('').expect(400);
  });
});
