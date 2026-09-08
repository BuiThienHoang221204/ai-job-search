/*
 * `ScraperService` nạp `AiService` để lấy token DI, mà `AiService` nạp `ai` và
 * `@ai-sdk/openai-compatible` — hai package ESM thuần jest không `require()`
 * được. Lần quét của HỆ THỐNG không gọi model (truy vấn sinh tất định), nên
 * chặn ngay ở tầng module là đủ.
 */
jest.mock('ai', () => ({}));
jest.mock('@ai-sdk/openai-compatible', () => ({}));

import type { ConfigService } from '@nestjs/config';
import type { AiService } from 'src/modules/ai/services/ai.service.js';
import { QUEUE } from 'src/modules/queue/queue.service.js';
import type { QueueService } from 'src/modules/queue/queue.service.js';
import type { JobSourceRouter } from 'src/modules/scraper/sources/job-source.router.js';
import type {
  PortalJobCard,
  SearchArgs,
} from 'src/modules/scraper/sources/portal-cli.service.js';
import { ScraperService } from 'src/modules/scraper/scraper.service.js';
import type { PromptBuilderService } from 'src/modules/skills/services/prompt-builder.service.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';

/*
 * Ba hành vi được ghim ở đây là ba thứ vừa thêm vào lượt quét hằng đêm, và cả
 * ba đều KHÔNG gây lỗi khi hỏng: quét thiếu trang thì chỉ thấy ít tin hơn, quên
 * lọc ngày thì tin cũ lặng lẽ vào database, còn quên gộp trùng thì mỗi bản sao
 * âm thầm tiêu một lượt gọi model của người dùng.
 */

const NOW = new Date('2026-08-19T00:00:00Z');

const card = (
  id: string,
  over: Partial<PortalJobCard> = {},
): PortalJobCard => ({
  id,
  slug: 'tin/' + id,
  title: 'Kế toán tổng hợp',
  company: 'Công ty ' + id,
  companyUrl: null,
  companyLogo: null,
  location: 'Hà Nội',
  workMode: null,
  salary: null,
  postedAt: '2 ngày trước',
  tags: [],
  url: 'https://vi.du/' + id,
  description: 'Mô tả đủ dài để không bị bỏ qua. '.repeat(5),
  ...over,
});

/** Portal giả trả về đúng những trang được kịch bản hoá. */
function fakePortals(
  pages: Record<number, PortalJobCard[]>,
  detailDescription: (slug: string) => string = () => 'x'.repeat(200),
) {
  const calls: SearchArgs[] = [];
  const detailSlugs: string[] = [];
  const router = {
    has: () => true,
    search: (_portal: string, args: SearchArgs) => {
      calls.push(args);
      return Promise.resolve(pages[args.page ?? 1] ?? []);
    },
    detail: (_portal: string, slug: string) => {
      detailSlugs.push(slug);
      return Promise.resolve({
        ...card(slug),
        description: detailDescription(slug),
      });
    },
  };
  return { router: router as unknown as JobSourceRouter, calls, detailSlugs };
}

/** Đúng phần của `occupationCrawl.upsert` mà test đọc tới. */
type CrawlUpsertArgs = { create: { occupationCode: string } };

type ProfileFindManyArgs = { orderBy?: unknown };
type ProfileStampArgs = {
  where: { userId: { in: string[] } };
  data: { lastFanOutAt: Date };
};

/** Đúng phần của `job.upsert` mà test đọc tới. */
type UpsertArgs = {
  create: {
    externalId: string;
    duplicateOfId: string | null;
    description: string;
  };
};

function fakePrisma(original: { id: string } | null = null) {
  let saved = 0;
  return {
    scrapeRun: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'run-1',
        portal: 'topcv',
        userId: null,
      }),
      update: jest.fn((args: { data: unknown }) => Promise.resolve(args.data)),
    },
    profile: {
      findMany: jest.fn<Promise<unknown[]>, [ProfileFindManyArgs]>(() =>
        Promise.resolve([
          {
            userId: 'u1',
            completion: 80,
            headline: 'Kế toán tổng hợp',
            primarySkills: [],
            secondarySkills: [],
            occupationCode: 'FINANCE',
          },
        ]),
      ),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn<Promise<{ count: number }>, [ProfileStampArgs]>(() =>
        Promise.resolve({ count: 0 }),
      ),
    },
    job: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(original),
      update: jest.fn(),
      upsert: jest.fn<Promise<{ id: string }>, [UpsertArgs]>(() =>
        Promise.resolve({ id: 'job-' + ++saved }),
      ),
    },
    jobMatch: { findMany: jest.fn().mockResolvedValue([]) },
    occupationCrawl: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn<Promise<unknown>, [CrawlUpsertArgs]>(() =>
        Promise.resolve({}),
      ),
    },
  };
}

const fakeQueue = () => ({
  send: jest.fn().mockResolvedValue(undefined),
  sendMany: jest.fn((_queue: string, items: unknown[]) =>
    Promise.resolve(items.length),
  ),
});

function buildService(
  prisma: ReturnType<typeof fakePrisma>,
  portals: JobSourceRouter,
  queue: ReturnType<typeof fakeQueue>,
  overrides: Record<string, unknown> = {},
) {
  const values: Record<string, unknown> = {
    'scraper.defaultLocation': 'Vietnam',
    'scraper.maxJobsPerPortal': 4,
    'scraper.maxAgeDays': 7,
    'scraper.maxPages': 5,
    'scraper.requirePostedAt': false,
    ...overrides,
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;

  return new ScraperService(
    prisma as unknown as PrismaService,
    {} as AiService,
    {} as PromptBuilderService,
    portals,
    queue as unknown as QueueService,
    config,
  );
}

/** Chạy `run()` với đồng hồ giả: nhịp lịch sự 1,2 giây mỗi request là thật. */
async function runScrape(service: ScraperService) {
  const running = service.run('run-1');
  await jest.runAllTimersAsync();
  return running;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ScraperService.run - phân trang', () => {
  test('duyệt tiếp trang sau cho tới khi đủ trần của portal', async () => {
    const { router, calls } = fakePortals({
      1: [card('a'), card('b')],
      2: [card('c'), card('d')],
      3: [card('e')],
    });
    const prisma = fakePrisma();
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    expect(calls.map((args) => args.page)).toEqual([1, 2]);
    expect(prisma.job.upsert).toHaveBeenCalledTimes(4);
  });

  test('dừng ngay khi một trang không thêm được tin nào mới', async () => {
    const { router, calls } = fakePortals({
      1: [card('a'), card('b')],
      2: [card('a'), card('b')],
      3: [card('c')],
    });
    const prisma = fakePrisma();
    const service = buildService(prisma, router, fakeQueue(), {
      'scraper.maxJobsPerPortal': 50,
    });

    await runScrape(service);

    expect(calls.map((args) => args.page)).toEqual([1, 2]);
    expect(prisma.job.upsert).toHaveBeenCalledTimes(2);
  });

  test('truyền hạn ngày xuống portal để nơi nào lọc được thì tự lọc', async () => {
    const { router, calls } = fakePortals({ 1: [card('a')] });
    const service = buildService(fakePrisma(), router, fakeQueue());

    await runScrape(service);

    expect(calls[0].postedWithinDays).toBe(7);
  });
});

describe('ScraperService.run - cửa sổ 7 ngày', () => {
  test('tin đăng quá hạn không được lưu', async () => {
    const { router } = fakePortals({
      1: [card('moi'), card('cu', { postedAt: '3 tuần trước' })],
    });
    const prisma = fakePrisma();
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    expect(prisma.job.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.job.upsert.mock.calls[0][0].create.externalId).toBe('moi');
  });

  test('không đọc được ngày đăng thì vẫn giữ', async () => {
    const { router } = fakePortals({
      1: [card('khong-ngay', { postedAt: null })],
    });
    const prisma = fakePrisma();
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    expect(prisma.job.upsert).toHaveBeenCalledTimes(1);
  });

  test('bật requirePostedAt thì tin thiếu ngày bị loại', async () => {
    const { router } = fakePortals({
      1: [card('khong-ngay', { postedAt: null })],
    });
    const prisma = fakePrisma();
    const service = buildService(prisma, router, fakeQueue(), {
      'scraper.requirePostedAt': true,
    });

    await runScrape(service);

    expect(prisma.job.upsert).not.toHaveBeenCalled();
  });
});

describe('ScraperService.run - mô tả bị portal cắt', () => {
  const CUT = 'Mô tả xem trước bị cắt ngang chừng. '.repeat(4) + 'Còn nữa...';

  test('thẻ có mô tả trọn vẹn thì không tốn thêm request chi tiết', async () => {
    const { router, detailSlugs } = fakePortals({ 1: [card('a')] });
    const service = buildService(fakePrisma(), router, fakeQueue());

    await runScrape(service);

    expect(detailSlugs).toEqual([]);
  });

  test('mô tả kết thúc bằng dấu ba chấm thì lấy lại từ trang chi tiết', async () => {
    // Chuỗi cụt vẫn dài hơn ngưỡng 80 nên không nhánh nào khác chặn được nó.
    const { router, detailSlugs } = fakePortals(
      { 1: [card('a', { description: CUT })] },
      () => 'Bản đầy đủ lấy từ trang chi tiết. '.repeat(10),
    );
    const prisma = fakePrisma();
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    expect(detailSlugs).toEqual(['tin/a']);
    expect(prisma.job.upsert.mock.calls[0][0].create.description).toContain(
      'Bản đầy đủ',
    );
  });

  test('trang chi tiết hỏng thì giữ mô tả cụt chứ không bỏ tin', async () => {
    const { router } = fakePortals(
      { 1: [card('a', { description: CUT })] },
      () => {
        throw new Error('portal 503');
      },
    );
    const prisma = fakePrisma();
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    expect(prisma.job.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.job.upsert.mock.calls[0][0].create.description).toBe(CUT);
  });

  test('không có mô tả và trang chi tiết cũng hỏng thì bỏ tin', async () => {
    const { router } = fakePortals(
      { 1: [card('a', { description: null })] },
      () => {
        throw new Error('portal 503');
      },
    );
    const prisma = fakePrisma();
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    expect(prisma.job.upsert).not.toHaveBeenCalled();
  });
});

describe('ScraperService.run - gộp tin trùng giữa các portal', () => {
  test('bản sao vẫn được lưu nhưng KHÔNG xếp hàng gọi model', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = fakePrisma({ id: 'ban-goc' });
    const queue = fakeQueue();
    const service = buildService(prisma, router, queue);

    await runScrape(service);

    expect(prisma.job.upsert.mock.calls[0][0].create.duplicateOfId).toBe(
      'ban-goc',
    );
    expect(queue.sendMany).not.toHaveBeenCalled();
  });

  test('tin đầu tiên mang vân tay đó thì đi tiếp như bình thường', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = fakePrisma(null);
    const queue = fakeQueue();
    const service = buildService(prisma, router, queue);

    await runScrape(service);

    expect(prisma.job.upsert.mock.calls[0][0].create.duplicateOfId).toBeNull();
    expect(queued(queue, QUEUE.EXTRACT_REQUIREMENTS)).toBe(true);
  });
});

/** Hàng đợi `name` có được xếp việc trong lượt quét vừa rồi không. */
function queued(queue: ReturnType<typeof fakeQueue>, name: string): boolean {
  return queue.sendMany.mock.calls.some((args) => args[0] === name);
}

describe('ScraperService.run - chấm điểm theo yêu cầu', () => {
  /*
   * Chấm mọi tin mới với mọi hồ sơ là phép nhân `số người × số tin`, thứ chặn
   * hệ thống ở khoảng 30 người dùng vì hàng đợi chạy tuần tự ở p50 33 giây.
   * Nay mặc định TẮT: điểm chấm khi người dùng bấm, còn danh sách hiển thị mức
   * khớp tính bằng code thuần trên đường đọc.
   */
  test('mặc định KHÔNG tự xếp hàng chấm điểm', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const queue = fakeQueue();
    const service = buildService(fakePrisma(null), router, queue);

    await runScrape(service);

    expect(queued(queue, QUEUE.EVALUATE_MATCH)).toBe(false);
  });

  test('nhưng vẫn rút trích yêu cầu - việc đó tính theo TIN, không theo người', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const queue = fakeQueue();
    const service = buildService(fakePrisma(null), router, queue);

    await runScrape(service);

    expect(queued(queue, QUEUE.EXTRACT_REQUIREMENTS)).toBe(true);
  });

  test('xếp hàng rút yêu cầu theo LÔ, không phải mỗi tin một việc', async () => {
    const { router } = fakePortals({
      1: Array.from({ length: 12 }, (_, index) => card(`tin-${index}`)),
    });
    const queue = fakeQueue();
    const service = buildService(fakePrisma(null), router, queue, {
      'scraper.maxJobsPerPortal': 12,
    });

    await runScrape(service);

    const call = queue.sendMany.mock.calls.find(
      (args) => args[0] === QUEUE.EXTRACT_REQUIREMENTS,
    );
    const batches = call![1] as Array<{ jobIds: string[] }>;

    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.jobIds.length)).toEqual([5, 5, 2]);
    expect(batches.flatMap((batch) => batch.jobIds)).toHaveLength(12);
  });

  test('bật cờ thì chấm lại như cũ', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const queue = fakeQueue();
    const service = buildService(fakePrisma(null), router, queue, {
      'scraper.autoScore': true,
    });

    await runScrape(service);

    expect(queued(queue, QUEUE.EVALUATE_MATCH)).toBe(true);
  });

  test('lượt quét ghi 0 lượt chấm khi cờ tắt', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = fakePrisma(null);
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    const done = prisma.scrapeRun.update.mock.calls.at(-1)![0].data as {
      jobsQueued: number;
    };
    expect(done.jobsQueued).toBe(0);
  });
});

/** Portal giả trả về trang khác nhau cho TỪNG truy vấn. */
function fakePortalsPerQuery(byQuery: Record<string, PortalJobCard[][]>) {
  const calls: SearchArgs[] = [];
  const router = {
    has: () => true,
    search: (_portal: string, args: SearchArgs) => {
      calls.push(args);
      const pages = byQuery[args.query ?? ''] ?? [];
      return Promise.resolve(pages[(args.page ?? 1) - 1] ?? []);
    },
    detail: (_portal: string, slug: string) =>
      Promise.resolve({ ...card(slug), description: 'x'.repeat(200) }),
  };
  return { router: router as unknown as JobSourceRouter, calls };
}

/** Hai hồ sơ hai ngành -> kế hoạch có hai từ khoá. */
function twoIndustryPrisma() {
  const prisma = fakePrisma();
  prisma.profile.findMany = jest.fn<Promise<unknown[]>, [ProfileFindManyArgs]>(
    () =>
      Promise.resolve([
        {
          userId: 'u1',
          completion: 80,
          headline: 'Kế toán tổng hợp',
          primarySkills: [],
          secondarySkills: [],
          occupationCode: 'FINANCE',
        },
        {
          userId: 'u2',
          completion: 80,
          headline: 'Điều dưỡng viên',
          primarySkills: [],
          secondarySkills: [],
          occupationCode: 'HEALTHCARE',
        },
      ]),
  );
  return prisma;
}

describe('ScraperService.run - chia hạn ngạch cho mọi truy vấn', () => {
  /*
   * Bản trước duyệt truy vấn ở vòng NGOÀI và thoát khi đầy hạn ngạch, nên truy
   * vấn đầu tiên lấy trọn suất của cả portal. Với lượt quét hệ thống - mỗi truy
   * vấn là một NGÀNH - điều đó nghĩa là chỉ một ngành được phục vụ, và không có
   * lỗi nào được ném ra để ai đó phát hiện.
   */
  test('truy vấn thứ hai vẫn được gửi dù truy vấn đầu đủ sức lấp trần', async () => {
    const { router, calls } = fakePortalsPerQuery({
      'Điều dưỡng viên': [[card('dd1'), card('dd2'), card('dd3'), card('dd4')]],
      'Kế toán tổng hợp': [[card('kt1'), card('kt2')]],
    });
    const prisma = twoIndustryPrisma();
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    expect(new Set(calls.map((args) => args.query))).toEqual(
      new Set(['Điều dưỡng viên', 'Kế toán tổng hợp']),
    );

    const saved = prisma.job.upsert.mock.calls.map(
      (args) => args[0].create.externalId,
    );
    expect(saved.some((id) => id.startsWith('dd'))).toBe(true);
    expect(saved.some((id) => id.startsWith('kt'))).toBe(true);
  });

  test('không truy vấn nào được vượt hạn ngạch riêng ở lượt đầu', async () => {
    // Trần 4 tin chia cho 2 truy vấn -> mỗi truy vấn 2 tin ở lượt đầu.
    const { router } = fakePortalsPerQuery({
      'Điều dưỡng viên': [[card('dd1'), card('dd2'), card('dd3'), card('dd4')]],
      'Kế toán tổng hợp': [[card('kt1'), card('kt2')]],
    });
    const prisma = twoIndustryPrisma();
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    const saved = prisma.job.upsert.mock.calls.map(
      (args) => args[0].create.externalId,
    );
    expect(saved.filter((id) => id.startsWith('kt'))).toHaveLength(2);
  });

  test('phần dư của truy vấn cạn sớm được chia lại', async () => {
    // Truy vấn thứ hai không có tin nào; trần 4 phải được truy vấn đầu lấp nốt.
    const { router } = fakePortalsPerQuery({
      'Điều dưỡng viên': [[card('dd1'), card('dd2'), card('dd3'), card('dd4')]],
      'Kế toán tổng hợp': [[]],
    });
    const prisma = twoIndustryPrisma();
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    expect(prisma.job.upsert).toHaveBeenCalledTimes(4);
  });

  test('không hỏi lại một truy vấn đã hết tin', async () => {
    const { router, calls } = fakePortalsPerQuery({
      'Điều dưỡng viên': [[card('dd1'), card('dd2'), card('dd3'), card('dd4')]],
      'Kế toán tổng hợp': [[]],
    });
    const service = buildService(twoIndustryPrisma(), router, fakeQueue());

    await runScrape(service);

    expect(
      calls.filter((args) => args.query === 'Kế toán tổng hợp'),
    ).toHaveLength(1);
  });
});

/** Hồ sơ của nhiều ngành, mỗi ngành `size` người. */
function industriesPrisma(
  sizes: Record<string, number>,
  marks: Array<{ occupationCode: string; lastCrawledAt: Date }> = [],
) {
  const prisma = fakePrisma();
  const profiles = Object.entries(sizes).flatMap(([occupationCode, size]) =>
    Array.from({ length: size }, (_, index) => ({
      userId: `${occupationCode}-${index}`,
      completion: 80,
      headline: `Chức danh ${occupationCode}`,
      primarySkills: [],
      secondarySkills: [],
      occupationCode,
    })),
  );

  prisma.profile.findMany = jest.fn<Promise<unknown[]>, [ProfileFindManyArgs]>(
    () => Promise.resolve(profiles),
  );
  prisma.occupationCrawl.findMany = jest.fn().mockResolvedValue(marks);
  return prisma;
}

describe('ScraperService.run - xoay vòng theo ngành', () => {
  /*
   * Khi số ngành vượt trần truy vấn, chọn theo bảng chữ cái nghĩa là những ngành
   * đầu bảng được quét mỗi đêm còn phần còn lại không bao giờ tới lượt. Xoay
   * vòng biến độ phủ thành một CHU KỲ, và chu kỳ đó phải ngắn hơn cửa sổ 7 ngày.
   */
  const plannedQueries = (prisma: ReturnType<typeof fakePrisma>): string[] => {
    const call = prisma.scrapeRun.update.mock.calls.find(
      (args) => (args[0].data as { queries?: unknown }).queries !== undefined,
    );
    const queries = (call![0].data as { queries: Array<{ query: string }> })
      .queries;
    return queries.map((q) => q.query);
  };

  test('chưa ngành nào được quét thì ưu tiên ngành đông người', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = industriesPrisma({ FINANCE: 3, HEALTHCARE: 2, IT: 1 });
    const service = buildService(prisma, router, fakeQueue(), {
      'scraper.systemQueryLimit': 2,
    });

    await runScrape(service);

    expect(plannedQueries(prisma)).toEqual([
      'Chức danh FINANCE',
      'Chức danh HEALTHCARE',
    ]);
  });

  test('ngành vừa quét đêm trước nhường chỗ cho ngành chưa tới lượt', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = industriesPrisma({ FINANCE: 3, HEALTHCARE: 2, IT: 1 }, [
      { occupationCode: 'FINANCE', lastCrawledAt: new Date(NOW) },
      { occupationCode: 'HEALTHCARE', lastCrawledAt: new Date(NOW) },
    ]);
    const service = buildService(prisma, router, fakeQueue(), {
      'scraper.systemQueryLimit': 2,
    });

    await runScrape(service);

    // IT chưa từng được quét nên đứng trước cả hai ngành đông người hơn.
    expect(plannedQueries(prisma)[0]).toBe('Chức danh IT');
  });

  test('đóng dấu đúng những ngành vừa dùng, không đóng dấu ngành bị cắt', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = industriesPrisma({ FINANCE: 3, HEALTHCARE: 2, IT: 1 });
    const service = buildService(prisma, router, fakeQueue(), {
      'scraper.systemQueryLimit': 2,
    });

    await runScrape(service);

    const stamped = prisma.occupationCrawl.upsert.mock.calls.map(
      (args) => args[0].create.occupationCode,
    );
    expect(stamped).toEqual(['FINANCE', 'HEALTHCARE']);
  });

  test('KHÔNG đóng dấu nghề chưa gửi được request nào', async () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const codes = Array.from(
      { length: 60 },
      (_, index) =>
        `NGHE${letters[Math.floor(index / 26)]}${letters[index % 26]}`,
    );

    const sizes = Object.fromEntries(
      codes.map((code, index) => [code, 60 - index]),
    );
    const byQuery = Object.fromEntries(
      codes.map((code) => [
        `Chức danh ${code}`,
        [Array.from({ length: 25 }, (_, index) => card(`${code}-${index}`))],
      ]),
    );

    const { router } = fakePortalsPerQuery(byQuery);
    const prisma = industriesPrisma(sizes);
    const service = buildService(prisma, router, fakeQueue(), {
      'scraper.systemQueryLimit': 60,
      'scraper.maxJobsPerPortal': 50,
    });

    await runScrape(service);

    const stamped = prisma.occupationCrawl.upsert.mock.calls.map(
      (args) => args[0].create.occupationCode,
    );

    expect(stamped.length).toBeGreaterThan(0);
    expect(stamped.length).toBeLessThan(60);
    expect(stamped).toEqual(codes.slice(0, stamped.length));
  });

  test('lượt quét theo NGƯỜI DÙNG không đóng dấu xoay vòng', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = industriesPrisma({ FINANCE: 3 });
    prisma.scrapeRun.findUnique = jest.fn().mockResolvedValue({
      id: 'run-1',
      portal: 'topcv',
      userId: 'u1',
    });
    prisma.profile.findUnique = jest.fn().mockResolvedValue({
      headline: 'Kế toán tổng hợp',
      location: 'Hà Nội',
      primarySkills: ['MISA'],
      targetSectors: [],
    });
    const service = buildService(prisma, router, fakeQueue());

    await runScrape(service);

    expect(prisma.occupationCrawl.upsert).not.toHaveBeenCalled();
  });
});

describe('ScraperService.run - xoay vòng hồ sơ được chấm điểm', () => {
  const profile = (over: Record<string, unknown> = {}) => ({
    userId: 'u1',
    completion: 80,
    headline: 'Kế toán tổng hợp',
    primarySkills: ['kế toán'],
    secondarySkills: [],
    occupationCode: 'FINANCE',
    ...over,
  });

  const scoringPrisma = (profiles = [profile()]) => {
    const prisma = fakePrisma();
    prisma.profile.findMany = jest.fn<
      Promise<unknown[]>,
      [ProfileFindManyArgs]
    >(() => Promise.resolve(profiles));
    prisma.job.findMany = jest.fn().mockResolvedValue([
      {
        id: 'job-1',
        title: 'Kế toán tổng hợp',
        description: 'Mô tả đủ dài để không bị bỏ qua.',
      },
    ]);
    return prisma;
  };

  const scoringService = (
    prisma: ReturnType<typeof fakePrisma>,
    router: JobSourceRouter,
  ) => buildService(prisma, router, fakeQueue(), { 'scraper.autoScore': true });

  test('hỏi hồ sơ theo lastFanOutAt tăng dần, chưa từng được phát thì lên trước', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = scoringPrisma();

    await runScrape(scoringService(prisma, router));

    const withOrder = prisma.profile.findMany.mock.calls
      .map((call) => call[0])
      .filter((args) => args.orderBy !== undefined);

    expect(withOrder).toHaveLength(1);
    expect(withOrder[0].orderBy).toEqual([
      { lastFanOutAt: { sort: 'asc', nulls: 'first' } },
      { userId: 'asc' },
    ]);
  });

  test('đóng dấu lastFanOutAt cho đúng những hồ sơ ĐƯỢC phát suất', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = scoringPrisma();

    await runScrape(scoringService(prisma, router));

    expect(prisma.profile.updateMany).toHaveBeenCalledTimes(1);

    const [args] = prisma.profile.updateMany.mock.calls[0];
    expect(args.where).toEqual({ userId: { in: ['u1'] } });
    expect(args.data.lastFanOutAt.getTime()).toBeGreaterThanOrEqual(
      NOW.getTime(),
    );
  });

  test('hồ sơ không dính kỹ năng nào của tin thì KHÔNG bị đóng dấu', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = scoringPrisma([profile({ primarySkills: ['kubernetes'] })]);

    await runScrape(scoringService(prisma, router));

    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });

  test('tắt SCRAPER_AUTO_SCORE thì không phát suất nào, cũng không đóng dấu', async () => {
    const { router } = fakePortals({ 1: [card('a')] });
    const prisma = scoringPrisma();

    await runScrape(buildService(prisma, router, fakeQueue()));

    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });
});
