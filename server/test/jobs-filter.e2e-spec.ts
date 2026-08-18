import request from 'supertest';
import {
  createTestApp,
  type TestApp,
  type TestUser,
} from './support/app-harness.js';

/// Bộ lọc, sắp xếp và phân trang của `GET /jobs`, kiểm ở tầng HTTP.
///
/// Trước tệp này, cả ba đều chạy TRONG BỘ NHỚ trên 300 tin mới nhất: `total`
/// tối đa là 300 dù bảng có bao nhiêu tin, tin thứ 301 trở đi không bao giờ vào
/// kết quả, và ô tìm kiếm chỉ tìm trong những tin đã tải về trình duyệt. Đó là
/// những lỗi chỉ lộ ra khi dữ liệu vượt ngưỡng, nên chúng cần một test cố tình
/// nạp nhiều hơn một trang.
describe('GET /jobs · lọc, sắp xếp, phân trang', () => {
  let harness: TestApp;
  let user: TestUser;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  const get = (query: Record<string, unknown> = {}) =>
    request(harness.server).get('/api/jobs').query(query).set(auth());

  type Page = {
    items: { id: string; title: string; salaryMax: number | null }[];
    total: number;
    limit: number;
    offset: number;
  };

  const pageOf = async (query: Record<string, unknown> = {}): Promise<Page> => {
    const response = await get(query).expect(200);
    return response.body as Page;
  };

  beforeEach(async () => {
    await harness.reset();
    user = await harness.signUp();
  });

  /// 120 tin: nhiều hơn hai trang mặc định, đủ để lộ mọi lỗi "chỉ đúng ở trang
  /// đầu". Ba tỉnh và hai ngành trộn đều nhau bằng phép chia lấy dư.
  const seedJobs = async (count: number) => {
    const cities = ['Hà Nội', 'TP.HCM', 'Đà Nẵng'];
    const titles = ['Backend Developer', 'Nhân viên Kế toán'];
    const now = Date.now();

    await harness.prisma.job.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        source: 'test',
        externalId: `tin-${index}`,
        url: `https://example.test/tin-${index}`,
        title: `${titles[index % 2]} ${index}`,
        company: `Công ty ${index}`,
        description: 'Mô tả đủ dài để qua được kiểm tra đầu vào của DTO.',
        location: cities[index % 3],
        salaryMax: 10_000_000 + index * 100_000,
        tags: [],
        postedAt: new Date(now - index * 60_000),
        // Thứ tự mặc định đo bằng `scrapedAt`, không phải `postedAt` - xem
        // `orderFor` trong jobs.service. Không đặt tay thì mọi hàng của một
        // `createMany` dùng chung `now()` và test không nói được gì về thứ tự.
        scrapedAt: new Date(now - index * 60_000),
        provinceCode: ['HN', 'HCM', 'DN'][index % 3],
        occupationCode: index % 2 === 0 ? 'IT' : 'FINANCE',
        searchText:
          `${titles[index % 2]} ${index} cong ty ${index}`.toLowerCase(),
      })),
    });
  };

  describe('phân trang', () => {
    beforeEach(() => seedJobs(120));

    test('total là tổng thật trên toàn bảng, không phải kích thước cửa sổ', async () => {
      const page = await pageOf({ limit: 20 });

      expect(page.items).toHaveLength(20);
      expect(page.total).toBe(120);
    });

    /// Chính là thứ cửa sổ 300 không bảo đảm được: tin ngoài cửa sổ vẫn phải
    /// tới được bằng cách lật trang.
    test('lật hết mọi trang thì thu đủ 120 tin, không trùng không sót', async () => {
      const ids: string[] = [];

      for (let offset = 0; offset < 120; offset += 40) {
        const page = await pageOf({ limit: 40, offset });
        ids.push(...page.items.map((item) => item.id));
      }

      expect(ids).toHaveLength(120);
      expect(new Set(ids).size).toBe(120);
    });

    test('offset vượt trần bị từ chối', async () => {
      await get({ offset: 2_001 }).expect(400);
      await get({ offset: 2_000 }).expect(200);
    });
  });

  describe('bộ lọc', () => {
    beforeEach(() => seedJobs(120));

    test('lọc theo tỉnh thu hẹp cả items lẫn total', async () => {
      const page = await pageOf({ province: 'HN', limit: 100 });

      expect(page.total).toBe(40);
      expect(page.items).toHaveLength(40);
    });

    test('nhiều tỉnh là phép HOẶC', async () => {
      const page = await pageOf({ province: ['HN', 'DN'], limit: 100 });

      expect(page.total).toBe(80);
    });

    test('lọc theo ngành nghề', async () => {
      const page = await pageOf({ occupation: 'FINANCE', limit: 100 });

      expect(page.total).toBe(60);
    });

    test('hai bộ lọc là phép VÀ, không phải HOẶC', async () => {
      const page = await pageOf({
        province: 'HN',
        occupation: 'IT',
        limit: 100,
      });

      expect(page.total).toBeLessThan(40);
      expect(page.total).toBeGreaterThan(0);
    });

    test('lọc theo lương tối thiểu', async () => {
      const page = await pageOf({ salaryMin: 20_000_000, limit: 100 });

      expect(page.total).toBeGreaterThan(0);
      for (const item of page.items) {
        expect(item.salaryMax).toBeGreaterThanOrEqual(20_000_000);
      }
    });

    test('lọc rỗng thì trả về danh sách rỗng, không phải toàn bộ bảng', async () => {
      const page = await pageOf({ province: 'CM' });

      expect(page.items).toHaveLength(0);
      expect(page.total).toBe(0);
    });
  });

  describe('tìm kiếm', () => {
    beforeEach(async () => {
      await harness.prisma.job.create({
        data: {
          source: 'test',
          externalId: 'tim-1',
          url: 'https://example.test/tim-1',
          title: 'Kỹ sư Cầu nối',
          company: 'Công ty Phần Mềm Việt',
          description: 'Mô tả đủ dài để qua được kiểm tra đầu vào của DTO.',
          tags: [],
          searchText: 'ky su cau noi cong ty phan mem viet',
        },
      });
    });

    test('gõ CÓ dấu vẫn khớp', async () => {
      expect((await pageOf({ q: 'Kỹ sư' })).total).toBe(1);
    });

    /// Cột `searchText` lưu bản đã bỏ dấu, và chuỗi người dùng gõ phải đi qua
    /// cùng hàm chuẩn hoá. Lệch nhau thì đây là test đỏ đầu tiên.
    test('gõ KHÔNG dấu vẫn khớp', async () => {
      expect((await pageOf({ q: 'ky su' })).total).toBe(1);
    });

    test('tìm được cả theo tên công ty', async () => {
      expect((await pageOf({ q: 'phan mem' })).total).toBe(1);
    });

    test('không khớp thì trả rỗng', async () => {
      expect((await pageOf({ q: 'khong co gi' })).total).toBe(0);
    });

    test('chuỗi chỉ toàn dấu câu không được coi là bộ lọc', async () => {
      expect((await pageOf({ q: '!!!' })).total).toBe(1);
    });
  });

  describe('sắp xếp', () => {
    beforeEach(() => seedJobs(30));

    /// "Mới nhất" đo bằng `scrapedAt` chứ không phải `postedAt`: chỉ cột đó
    /// không null nên chỉ nó index được. Xem `orderFor` trong jobs.service.
    test('mặc định là tin vào hệ thống gần nhất trước', async () => {
      const page = await pageOf({ limit: 5 });
      const titles = page.items.map((item) => item.title);

      expect(titles[0]).toMatch(/ 0$/);
      expect(titles[4]).toMatch(/ 4$/);
    });

    test('sort=salary xếp lương cao xuống thấp, xuyên trang', async () => {
      const first = await pageOf({ sort: 'salary', limit: 10 });
      const second = await pageOf({ sort: 'salary', limit: 10, offset: 10 });
      const values = [...first.items, ...second.items].map(
        (item) => item.salaryMax ?? -1,
      );

      expect(values).toEqual([...values].sort((a, b) => b - a));
    });

    /// Chế độ này CỐ Ý chỉ trả tin đã chấm điểm: không có chỗ nào đặt tin chưa
    /// chấm cho đúng trong một danh sách sắp theo điểm.
    test('sort=match chỉ trả tin đã có điểm AI', async () => {
      const all = await pageOf({ limit: 100 });
      const scored = all.items.slice(0, 3);

      for (const [index, job] of scored.entries()) {
        await harness.prisma.jobMatch.create({
          data: {
            userId: user.id,
            jobId: job.id,
            status: 'DONE',
            overallScore: 50 + index * 10,
          },
        });
      }

      const page = await pageOf({ sort: 'match', limit: 100 });

      expect(page.total).toBe(3);
      expect(page.items.map((item) => item.id)).toEqual(
        [...scored].reverse().map((item) => item.id),
      );
    });

    test('sort=match vẫn tôn trọng bộ lọc tỉnh', async () => {
      const hanoi = await pageOf({ province: 'HN', limit: 100 });
      await harness.prisma.jobMatch.create({
        data: {
          userId: user.id,
          jobId: hanoi.items[0].id,
          status: 'DONE',
          overallScore: 80,
        },
      });

      expect((await pageOf({ sort: 'match', province: 'HCM' })).total).toBe(0);
      expect((await pageOf({ sort: 'match', province: 'HN' })).total).toBe(1);
    });
  });

  /// `description` có trần 60KB và không thẻ việc làm nào hiển thị nó. Trả về ở
  /// danh sách là kéo hàng megabyte qua dây cho mỗi lần lật trang.
  test('danh sách KHÔNG trả về description', async () => {
    await seedJobs(1);
    const response = await get({ limit: 1 }).expect(200);
    const body = response.body as { items: Record<string, unknown>[] };

    expect(body.items[0]).not.toHaveProperty('description');
    expect(body.items[0]).toHaveProperty('title');
  });

  describe('GET /jobs/filters', () => {
    beforeEach(() => seedJobs(120));

    test('trả danh mục kèm số tin mỗi mục', async () => {
      const response = await request(harness.server)
        .get('/api/jobs/filters')
        .set(auth())
        .expect(200);

      const body = response.body as {
        provinces: { code: string; name: string; count: number }[];
        occupations: { code: string; count: number }[];
      };

      const hanoi = body.provinces.find((row) => row.code === 'HN');
      expect(hanoi?.count).toBe(40);
      expect(hanoi?.name).toBe('Hà Nội');

      const it = body.occupations.find((row) => row.code === 'IT');
      expect(it?.count).toBe(60);
    });

    test('mục không có tin nào vẫn xuất hiện với count 0', async () => {
      const response = await request(harness.server)
        .get('/api/jobs/filters')
        .set(auth())
        .expect(200);

      const body = response.body as {
        provinces: { code: string; count: number }[];
      };

      expect(body.provinces.find((row) => row.code === 'CM')?.count).toBe(0);
    });
  });
});
