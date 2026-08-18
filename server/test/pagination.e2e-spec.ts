import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/// Hợp đồng phân trang, kiểm ở tầng HTTP trên mọi API danh sách.
///
/// Trước tệp này chỉ `GET /matches` có phân trang thật; các endpoint khác hoặc
/// không có trần nào, hoặc có `take` cứng mà không trả tổng số. Cả hai đều là
/// lỗi chỉ lộ ra khi dữ liệu đủ nhiều, tức là ở production chứ không ở máy dev
/// - nên chúng cần một test khoá lại ngay từ khi bảng còn rỗng.
describe('Phân trang trên các API danh sách', () => {
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

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /// Mọi endpoint danh sách, kèm cách nạp N bản ghi cho endpoint đó.
  const ENDPOINTS = [
    {
      path: '/api/documents',
      seed: (userId: string, count: number) =>
        harness.prisma.document.createMany({
          data: Array.from({ length: count }, (_, index) => ({
            userId,
            kind: 'CV' as const,
            title: `Tài liệu ${index}`,
          })),
        }),
    },
    {
      path: '/api/applications',
      seed: async (userId: string, count: number) => {
        for (let index = 0; index < count; index += 1) {
          const job = await harness.prisma.job.create({
            data: {
              source: 'test',
              externalId: `don-${index}`,
              url: `https://example.test/don-${index}`,
              title: `Vị trí ${index}`,
              company: 'Công ty Thử Nghiệm',
              description: 'Mô tả đủ dài để qua được kiểm tra đầu vào.',
            },
          });
          await harness.prisma.application.create({
            data: { userId, jobId: job.id, status: 'RANKED' },
          });
        }
      },
    },
    {
      path: '/api/scrape/runs',
      seed: (userId: string, count: number) =>
        harness.prisma.scrapeRun.createMany({
          data: Array.from({ length: count }, () => ({
            userId,
            portal: 'topcv',
            status: 'DONE' as const,
          })),
        }),
    },
    {
      path: '/api/upskill/history',
      seed: (userId: string, count: number) =>
        harness.prisma.upskillReport.createMany({
          data: Array.from({ length: count }, () => ({
            userId,
            mode: 'AGGREGATE' as const,
            status: 'DONE' as const,
          })),
        }),
    },
  ];

  describe.each(ENDPOINTS)('$path', ({ path, seed }) => {
    test('total là tổng thật, không phải độ dài trang', async () => {
      await seed(user.id, 7);

      const response = await request(harness.server)
        .get(path)
        .query({ limit: 3 })
        .set(auth(user.token))
        .expect(200);

      const page = response.body as { items: unknown[]; total: number };
      expect(page.items).toHaveLength(3);
      expect(page.total).toBe(7);
    });

    test('offset nhảy đúng bản ghi, không trùng và không sót', async () => {
      await seed(user.id, 5);

      const idsOf = async (offset: number) => {
        const response = await request(harness.server)
          .get(path)
          .query({ limit: 2, offset })
          .set(auth(user.token))
          .expect(200);
        const page = response.body as { items: { id: string }[] };
        return page.items.map((item) => item.id);
      };

      const [first, second, third] = await Promise.all([
        idsOf(0),
        idsOf(2),
        idsOf(4),
      ]);
      const all = [...first, ...second, ...third];

      expect(all).toHaveLength(5);
      expect(new Set(all).size).toBe(5);
    });

    test('limit và offset trả về là giá trị đã thực sự dùng', async () => {
      const response = await request(harness.server)
        .get(path)
        .query({ limit: 4, offset: 8 })
        .set(auth(user.token))
        .expect(200);

      expect(response.body).toMatchObject({ limit: 4, offset: 8 });
    });

    test('limit vượt trần bị từ chối, không bị lặng lẽ cắt', async () => {
      await request(harness.server)
        .get(path)
        .query({ limit: 101 })
        .set(auth(user.token))
        .expect(400);
    });

    test('offset âm bị từ chối', async () => {
      await request(harness.server)
        .get(path)
        .query({ offset: -1 })
        .set(auth(user.token))
        .expect(400);
    });
  });

  /// `counts` là thứ vẽ các tab trên màn Lịch sử ứng tuyển. Nó ĐẾM TRÊN TOÀN BỘ
  /// đơn, nên phải đứng yên khi người dùng đổi tab hoặc lật trang - nếu không,
  /// bấm sang tab "Phỏng vấn" sẽ làm mọi con số khác tụt về 0.
  describe('GET /api/applications · counts', () => {
    beforeEach(async () => {
      for (const status of [
        'RANKED',
        'RANKED',
        'INTERVIEW',
        'HIRED',
      ] as const) {
        const job = await harness.prisma.job.create({
          data: {
            source: 'test',
            externalId: `dem-${status}-${Math.random()}`,
            url: 'https://example.test/dem',
            title: 'Vị trí',
            company: 'Công ty Thử Nghiệm',
            description: 'Mô tả đủ dài để qua được kiểm tra đầu vào.',
          },
        });
        await harness.prisma.application.create({
          data: { userId: user.id, jobId: job.id, status },
        });
      }
    });

    const countsOf = async (query: Record<string, unknown>) => {
      const response = await request(harness.server)
        .get('/api/applications')
        .query(query)
        .set(auth(user.token))
        .expect(200);
      return response.body as {
        items: unknown[];
        total: number;
        counts: Record<string, number>;
      };
    };

    test('không đổi khi lọc theo tab', async () => {
      const expected = { all: 4, open: 2, interview: 1, offer: 0, closed: 1 };

      expect((await countsOf({})).counts).toEqual(expected);
      expect((await countsOf({ group: 'interview' })).counts).toEqual(expected);
      expect((await countsOf({ group: 'closed' })).counts).toEqual(expected);
    });

    test('total thì ĐỔI theo tab, vì nó đếm trên tập đã lọc', async () => {
      expect((await countsOf({})).total).toBe(4);
      expect((await countsOf({ group: 'interview' })).total).toBe(1);
      expect((await countsOf({ group: 'open' })).total).toBe(2);
    });

    test('không đổi khi lật sang trang không còn bản ghi nào', async () => {
      const page = await countsOf({ limit: 2, offset: 50 });

      expect(page.items).toHaveLength(0);
      expect(page.counts.all).toBe(4);
    });
  });
});
