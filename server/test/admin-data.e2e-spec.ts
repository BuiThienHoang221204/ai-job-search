import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

// Vector 768 chiều đủ khác nhau để toán tử `<=>` của pgvector có thứ tự rõ ràng.
const vector = (seed: number) =>
  `[${Array.from({ length: 768 }, (_, i) => (i === seed ? 1 : 0.001)).join(',')}]`;

// supertest trả `body: any`; ép về đúng hình dạng đang khẳng định.
const json = <T>(response: { body: unknown }) => response.body as T;

describe('API dữ liệu của màn quản trị', () => {
  let harness: TestApp;
  let admin: TestUser;
  let user: TestUser;

  const as = (who: TestUser) => ({
    get: (path: string) =>
      request(harness.server)
        .get(`/api${path}`)
        .set('Authorization', `Bearer ${who.token}`),
    post: (path: string, body?: object) =>
      request(harness.server)
        .post(`/api${path}`)
        .set('Authorization', `Bearer ${who.token}`)
        .send(body ?? {}),
    put: (path: string, body: object) =>
      request(harness.server)
        .put(`/api${path}`)
        .set('Authorization', `Bearer ${who.token}`)
        .send(body),
  });

  const insertSkill = async (id: string, name: string, seed: number) => {
    await harness.prisma.$executeRawUnsafe(
      `insert into canonical_skills (id, name, model, embedding) values ($1, $2, 'test-model', $3::vector)`,
      id,
      name,
      vector(seed),
    );
  };

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    admin = await harness.signUp('admin@test.local');
    await harness.promoteToAdmin(admin.id);
    user = await harness.signUp('user@test.local');
  });

  test.each([
    ['get', '/admin/users'],
    ['get', '/admin/jobs'],
    ['get', '/admin/jobs/sources'],
    ['get', '/admin/skills'],
    ['get', '/admin/skills/summary'],
    ['get', '/admin/ai-usage'],
    ['get', '/admin/scrape/runs'],
    ['get', '/admin/overview'],
    ['get', '/admin/scrape/portals'],
    ['get', '/admin/scrape/batches'],
    ['get', '/admin/ai-failures/facets'],
    ['post', '/admin/skills/rematch'],
  ] as const)('tài khoản thường gọi %s %s nhận 403', async (method, path) => {
    await as(user)[method](path).expect(403);
  });

  describe('người dùng', () => {
    test('tìm theo email, không trả passwordHash', async () => {
      const response = await as(admin)
        .get('/admin/users?q=user@test')
        .expect(200);
      const page = response.body as {
        items: Array<Record<string, unknown>>;
        total: number;
      };
      expect(page.total).toBe(1);
      expect(page.items[0].email).toBe('user@test.local');
      expect(page.items[0]).not.toHaveProperty('passwordHash');
    });

    test('nâng quyền có hiệu lực ngay ở request kế tiếp', async () => {
      await as(admin)
        .put(`/admin/users/${user.id}/role`, { role: 'ADMIN' })
        .expect(200);
      await as(user).get('/admin/users').expect(200);
    });

    test('không tự hạ quyền chính mình được', async () => {
      await as(admin)
        .put(`/admin/users/${admin.id}/role`, { role: 'USER' })
        .expect(400);
    });

    test('vai trò lạ bị ValidationPipe chặn', async () => {
      await as(admin)
        .put(`/admin/users/${user.id}/role`, { role: 'ROOT' })
        .expect(400);
    });
  });

  describe('lời gọi AI', () => {
    test('che phản hồi thô của tác vụ mang dữ liệu cá nhân', async () => {
      const call = await harness.prisma.aiCall.create({
        data: {
          userId: user.id,
          purpose: 'document.cv',
          provider: 'p',
          modelId: 'm',
          ok: false,
          failureKind: 'SCHEMA',
          durationMs: 100,
          responseText: '{"fullName":"Nguyễn Văn A"}',
        },
      });
      const response = await as(admin)
        .get(`/admin/ai-calls/${call.id}`)
        .expect(200);
      expect(
        json<{ responseText: string | null; responseRedacted: boolean }>(
          response,
        ),
      ).toMatchObject({ responseText: null, responseRedacted: true });
    });

    test('ai-usage cộng token theo model và xếp người dùng tốn nhất', async () => {
      await harness.prisma.aiCall.createMany({
        data: [
          {
            userId: user.id,
            purpose: 'match.evaluate',
            provider: 'p',
            modelId: 'a',
            ok: true,
            durationMs: 1,
            inputTokens: 100,
            outputTokens: 10,
          },
          {
            userId: user.id,
            purpose: 'match.evaluate',
            provider: 'p',
            modelId: 'a',
            ok: false,
            durationMs: 1,
            inputTokens: 50,
            outputTokens: 0,
          },
          {
            purpose: 'skill.canonicalize',
            provider: 'p',
            modelId: 'b',
            ok: true,
            durationMs: 1,
          },
        ],
      });
      const response = await as(admin)
        .get('/admin/ai-usage?days=1')
        .expect(200);
      const body = response.body as {
        totals: {
          calls: number;
          failed: number;
          totalTokens: number;
          untrackedCalls: number;
        };
        byModel: Array<{
          modelId: string;
          totalTokens: number;
          failed: number;
        }>;
        granularity: string;
        buckets: Array<{ calls: number }>;
        topUsers: Array<{ email: string; totalTokens: number }>;
      };
      expect(body.totals).toMatchObject({
        calls: 3,
        failed: 1,
        totalTokens: 160,
        untrackedCalls: 1,
      });
      expect(body.byModel[0]).toMatchObject({
        modelId: 'a',
        totalTokens: 160,
        failed: 1,
      });
      // Cửa sổ 24 giờ chia theo giờ; cả 3 lời gọi vừa tạo rơi vào ô cuối.
      expect(body.granularity).toBe('hour');
      expect(body.buckets).toHaveLength(24);
      expect(body.buckets[23].calls).toBe(3);
      expect(body.topUsers).toEqual([
        expect.objectContaining({ email: 'user@test.local', totalTokens: 160 }),
      ]);
    });
  });

  describe('từ điển kỹ năng', () => {
    beforeEach(async () => {
      await insertSkill('s-react', 'React', 1);
      await insertSkill('s-reactjs', 'ReactJS', 2);
      await harness.prisma.skillAlias.createMany({
        data: [
          { key: 'react', raw: 'React', skillId: 's-react', source: 'EXACT' },
          {
            key: 'reactjs',
            raw: 'ReactJS',
            skillId: 's-reactjs',
            source: 'EXACT',
          },
          {
            key: 'react.js',
            raw: 'React.js',
            skillId: 's-reactjs',
            source: 'LLM',
          },
        ],
      });
    });

    test('tìm theo cách viết, không chỉ theo tên chuẩn', async () => {
      const response = await as(admin)
        .get('/admin/skills?q=react.js')
        .expect(200);
      const page = json<{ items: Array<{ id: string }> }>(response);
      expect(page.items.map((row) => row.id)).toEqual(['s-reactjs']);
    });

    test('chi tiết có kỹ năng láng giềng theo embedding', async () => {
      const response = await as(admin).get('/admin/skills/s-react').expect(200);
      const skill = json<{ neighbors: unknown[] }>(response);
      expect(skill.neighbors[0]).toMatchObject({
        id: 's-reactjs',
        aliases: 2,
      });
    });

    test('gộp dồn alias sang đích, đánh dấu MANUAL và xoá kỹ năng nguồn', async () => {
      const response = await as(admin)
        .post('/admin/skills/s-reactjs/merge', { targetId: 's-react' })
        .expect(200);
      expect(json<{ movedAliases: number }>(response).movedAliases).toBe(2);

      const aliases = await harness.prisma.skillAlias.findMany({
        orderBy: { key: 'asc' },
      });
      expect(aliases.map((a) => [a.key, a.skillId, a.source])).toEqual([
        ['react', 's-react', 'EXACT'],
        ['react.js', 's-react', 'MANUAL'],
        ['reactjs', 's-react', 'MANUAL'],
      ]);
      expect(await harness.prisma.canonicalSkill.count()).toBe(1);
    });

    test('không gộp một kỹ năng vào chính nó', async () => {
      await as(admin)
        .post('/admin/skills/s-react/merge', { targetId: 's-react' })
        .expect(400);
    });

    test('chuyển alias cuối cùng thì xoá luôn kỹ năng rỗng', async () => {
      const response = await as(admin)
        .post('/admin/skills/aliases/move', {
          key: 'react',
          skillId: 's-reactjs',
        })
        .expect(200);
      expect(
        json<{ removedEmptySkill: boolean }>(response).removedEmptySkill,
      ).toBe(true);
      expect(
        await harness.prisma.canonicalSkill.findUnique({
          where: { id: 's-react' },
        }),
      ).toBeNull();
    });

    test('đối chiếu lại toàn kho xếp đúng một việc vào hàng match.requirements', async () => {
      await as(admin).post('/admin/skills/rematch').expect(202);
      expect(harness.queue.sentTo('match.requirements')).toEqual([{}]);
    });
  });

  describe('tin tuyển dụng', () => {
    test('lọc tin chưa từng rút yêu cầu và trả nguồn kèm số tin', async () => {
      await harness.prisma.job.createMany({
        data: [
          {
            source: 'itviec',
            url: 'https://x/1',
            title: 'Kế toán',
            company: 'A',
            description: 'd',
          },
          {
            source: 'topcv',
            url: 'https://x/2',
            title: 'Y tá',
            company: 'B',
            description: 'd',
          },
        ],
      });
      const [first] = await harness.prisma.job.findMany({
        where: { source: 'itviec' },
      });
      await harness.prisma.jobRequirement.create({
        data: { jobId: first.id, status: 'DONE' },
      });

      const none = await as(admin)
        .get('/admin/jobs?requirement=NONE')
        .expect(200);
      const page = json<{ items: Array<{ source: string }> }>(none);
      expect(page.items.map((row) => row.source)).toEqual(['topcv']);

      const sources = await as(admin)
        .get('/admin/jobs/sources?limit=1&offset=1')
        .expect(200);
      expect(sources.body).toEqual({
        items: [{ source: 'topcv', count: 1 }],
        total: 2,
        limit: 1,
        offset: 1,
      });

      const detail = await as(admin).get(`/admin/jobs/${first.id}`).expect(200);
      expect(
        json<{ requirements: { status: string } }>(detail).requirements.status,
      ).toBe('DONE');
    });
  });

  test('lịch sử quét gom theo lượt đêm và lọc được lượt hỏng', async () => {
    const night = new Date(Date.now() - 60 * 60 * 1000);
    const earlier = new Date(night.getTime() - 24 * 60 * 60 * 1000);
    await harness.prisma.scrapeRun.createMany({
      data: [
        { portal: 'itviec', status: 'DONE', jobsNew: 3, createdAt: night },
        {
          portal: 'topcv',
          status: 'FAILED',
          error: 'TopCV trả về 403',
          createdAt: new Date(night.getTime() + 2_000),
        },
        { portal: 'itviec', status: 'DONE', jobsNew: 5, createdAt: earlier },
      ],
    });

    const all = await as(admin).get('/admin/scrape/batches').expect(200);
    const page = json<{
      total: number;
      items: Array<{ failed: number; totalNew: number; runs: object }>;
    }>(all);
    expect(page.total).toBe(2);
    expect(Object.keys(page.items[0].runs).sort()).toEqual(['itviec', 'topcv']);
    expect(page.items[0]).toMatchObject({ failed: 1, totalNew: 3 });

    const failed = await as(admin)
      .get('/admin/scrape/batches?failedOnly=true')
      .expect(200);
    expect(json<{ total: number }>(failed).total).toBe(1);

    // Chỉ lấy từ 12 giờ trước: lượt hôm qua bị loại.
    const from = new Date(night.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const recent = await as(admin)
      .get(`/admin/scrape/batches?from=${encodeURIComponent(from)}`)
      .expect(200);
    expect(json<{ total: number }>(recent).total).toBe(1);

    await as(admin).get('/admin/scrape/batches?from=hom-qua').expect(400);

    const portals = await as(admin).get('/admin/scrape/portals').expect(200);
    const body = json<{ cap: number; items: unknown[] }>(portals);
    expect(body.cap).toBeGreaterThan(0);
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('nhật ký lỗi lọc theo thời gian, loại, tác vụ, model; OTHER gồm cả null', async () => {
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const base = { provider: 'omniroute', ok: false, durationMs: 1 };
    await harness.prisma.aiCall.createMany({
      data: [
        {
          ...base,
          purpose: 'match.evaluate',
          modelId: 'oc/mimo',
          failureKind: 'SCHEMA',
        },
        {
          ...base,
          purpose: 'match.evaluate',
          modelId: 'cl/sonnet',
          failureKind: null,
        },
        {
          ...base,
          purpose: 'skill.canonicalize',
          modelId: 'oc/mimo',
          failureKind: 'OTHER',
        },
        {
          ...base,
          purpose: 'match.evaluate',
          modelId: 'oc/mimo',
          failureKind: 'SCHEMA',
          createdAt: old,
        },
        {
          provider: 'p',
          purpose: 'match.evaluate',
          modelId: 'oc/mimo',
          ok: true,
          durationMs: 1,
        },
      ],
    });
    const total = async (query: string) =>
      json<{ total: number }>(
        await as(admin).get(`/admin/ai-failures?${query}`).expect(200),
      ).total;

    const from = encodeURIComponent(
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(await total('')).toBe(4);
    expect(await total(`from=${from}`)).toBe(3);
    expect(await total(`from=${from}&failureKind=OTHER`)).toBe(2);
    expect(await total(`from=${from}&purpose=match.evaluate`)).toBe(2);
    expect(await total(`from=${from}&model=MIMO`)).toBe(2);
    await as(admin).get('/admin/ai-failures?failureKind=BOGUS').expect(400);

    const facets = json<{
      purposes: Array<{ purpose: string; count: number }>;
      models: Array<{ modelId: string; count: number }>;
    }>(
      await as(admin).get(`/admin/ai-failures/facets?from=${from}`).expect(200),
    );
    expect(facets.purposes).toEqual([
      { purpose: 'match.evaluate', count: 2 },
      { purpose: 'skill.canonicalize', count: 1 },
    ]);
    expect(facets.models[0]).toMatchObject({ modelId: 'oc/mimo', count: 2 });
  });

  test('cấu hình hàng đợi trả về dạng trang', async () => {
    const response = await as(admin)
      .get('/admin/queue/config?limit=2')
      .expect(200);
    const page = json<{ items: unknown[]; total: number; limit: number }>(
      response,
    );
    expect(page.limit).toBe(2);
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.total).toBeGreaterThanOrEqual(page.items.length);
  });

  test('tổng quan báo sự cố AI kèm nguyên nhân và gom lỗi theo nhóm', async () => {
    const failed = Array.from({ length: 15 }, () => ({
      purpose: 'skill.canonicalize',
      provider: 'p',
      modelId: 'm',
      ok: false,
      failureKind: 'SCHEMA' as const,
      errorMessage: 'No object generated',
      durationMs: 1,
    }));
    const passed = Array.from({ length: 10 }, () => ({
      purpose: 'match.evaluate',
      provider: 'p',
      modelId: 'm',
      ok: true,
      durationMs: 1,
    }));
    await harness.prisma.aiCall.createMany({ data: [...failed, ...passed] });

    const response = await as(admin).get('/admin/overview').expect(200);
    const body = json<{
      metrics: {
        aiCalls: { current: number };
        successRate: { current: number };
      };
      errorGroups: Array<{
        purpose: string;
        failureKind: string;
        count: number;
        sample: string;
      }>;
      attention: Array<{ id: string; severity: string }>;
      series: unknown[];
    }>(response);

    expect(body.metrics.aiCalls.current).toBe(25);
    expect(body.metrics.successRate.current).toBe(40);
    expect(body.errorGroups).toEqual([
      expect.objectContaining({
        purpose: 'skill.canonicalize',
        failureKind: 'SCHEMA',
        count: 15,
        sample: 'No object generated',
      }),
    ]);
    expect(body.attention[0]).toMatchObject({
      id: 'ai-success',
      severity: 'danger',
    });
    expect(body.series).toHaveLength(24);
  });

  test('lịch sử quét toàn hệ thống gồm cả lượt của tài khoản khác', async () => {
    await harness.prisma.scrapeRun.createMany({
      data: [
        { portal: 'itviec', userId: null },
        { portal: 'topcv', userId: user.id },
      ],
    });
    const response = await as(admin).get('/admin/scrape/runs').expect(200);
    const page = json<{
      total: number;
      items: Array<{ user: { email: string } | null }>;
    }>(response);
    expect(page.total).toBe(2);
    const owners = page.items.map((row) => row.user?.email ?? null);
    expect(owners.sort()).toEqual([null, 'user@test.local'].sort());
  });
});
