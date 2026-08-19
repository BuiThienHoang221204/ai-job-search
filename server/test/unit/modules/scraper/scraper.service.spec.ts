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
import type { QueueService } from 'src/modules/queue/queue.service.js';
import type { JobSourceRouter } from 'src/modules/scraper/job-source.router.js';
import type {
  PortalJobCard,
  SearchArgs,
} from 'src/modules/scraper/services/portal-cli.service.js';
import { ScraperService } from 'src/modules/scraper/services/scraper.service.js';
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
function fakePortals(pages: Record<number, PortalJobCard[]>) {
  const calls: SearchArgs[] = [];
  const router = {
    has: () => true,
    search: (_portal: string, args: SearchArgs) => {
      calls.push(args);
      return Promise.resolve(pages[args.page ?? 1] ?? []);
    },
    detail: (_portal: string, slug: string) =>
      Promise.resolve({ ...card(slug), description: 'x'.repeat(200) }),
  };
  return { router: router as unknown as JobSourceRouter, calls };
}

/** Đúng phần của `job.upsert` mà test đọc tới. */
type UpsertArgs = {
  create: { externalId: string; duplicateOfId: string | null };
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
      findMany: jest.fn().mockResolvedValue([
        {
          userId: 'u1',
          completion: 80,
          headline: 'Kế toán tổng hợp',
          primarySkills: [],
          secondarySkills: [],
        },
      ]),
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
    expect(queue.sendMany).toHaveBeenCalled();
  });
});
