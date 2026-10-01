import { collectCards } from 'src/modules/scraper/utils/collect-cards.js';
import type {
  CollectLimits,
  PlannedQuery,
  PortalJobCard,
} from 'src/modules/scraper/types.js';

const card = (id: string): PortalJobCard => ({
  id,
  slug: id,
  title: id,
  company: 'Công ty',
  companyUrl: null,
  companyLogo: null,
  location: 'Hà Nội',
  workMode: null,
  salary: null,
  postedAt: new Date().toISOString(),
  tags: [],
  url: `https://portal.test/${id}`,
});

const limits = (maxJobsPerPortal: number): CollectLimits => ({
  maxJobsPerPortal,
  maxPages: 5,
  maxAgeDays: 7,
  requirePostedAt: false,
  defaultLocation: 'Vietnam',
});

const queriesOf = (count: number): PlannedQuery[] =>
  Array.from({ length: count }, (_, index) => ({
    query: `nghe-${index + 1}`,
    location: '',
    rationale: '',
  }));

async function collect(count: number, maxJobsPerPortal: number) {
  const asked: string[] = [];
  const queries = queriesOf(count);

  const running = collectCards(
    {
      search: (_portal, args) => {
        asked.push(args.query!);
        return Promise.resolve(
          Array.from({ length: 25 }, (_, index) =>
            card(`${args.query}-p${args.page}-${index}`),
          ),
        );
      },
      log: () => {},
      limits: limits(maxJobsPerPortal),
    },
    'topcv',
    queries,
  );

  await jest.runAllTimersAsync();
  return { outcome: await running, asked: new Set(asked), queries };
}

describe('collectCards chia hạn ngạch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('mọi truy vấn đều gửi được ít nhất một request khi trần tin đủ chỗ', async () => {
    const { asked, outcome } = await collect(20, 50);

    expect(asked.size).toBe(20);
    expect(outcome.askedIndices).toHaveLength(20);
  });

  it('không đổi hành vi ở cấu hình cũ 10 truy vấn', async () => {
    const { asked } = await collect(10, 50);

    expect(asked.size).toBe(10);
  });

  it('vẫn tôn trọng trần tin của portal', async () => {
    const { outcome } = await collect(20, 50);

    expect(outcome.cards).toHaveLength(50);
  });

  it('báo ra truy vấn nào KHÔNG gửi được request khi trần quá chật', async () => {
    const { outcome } = await collect(60, 50);

    expect(outcome.askedIndices.length).toBeLessThan(60);
    expect(outcome.askedIndices).toEqual(
      [...outcome.askedIndices].sort((a, b) => a - b),
    );
  });
});

describe('collectCards khi một truy vấn lỗi', () => {
  /** Portal giả: truy vấn nằm trong `failing` thì ném đúng lỗi đó, còn lại trả một trang 25 tin. */
  function collectWith(count: number, failing: Record<string, Error>) {
    const asked: string[] = [];
    const logs: string[] = [];
    const outcome = collectCards(
      {
        search: (_portal, args) => {
          asked.push(args.query!);
          const error = failing[args.query!];
          if (error) return Promise.reject(error);
          return Promise.resolve(
            Array.from({ length: 25 }, (_, index) =>
              card(`${args.query}-p${args.page}-${index}`),
            ),
          );
        },
        log: (message) => logs.push(message),
        limits: { ...limits(60), maxPages: 1 },
      },
      'topcv',
      queriesOf(count),
    );
    return { outcome, asked, logs };
  }

  it('lỗi thường ở MỘT truy vấn: giữ tin các truy vấn khác, truy vấn lỗi KHÔNG bị đóng dấu đã quét', async () => {
    const { outcome, logs } = collectWith(3, {
      'nghe-2': new Error(
        'topcv: TopCV trả về 502 sau 5 lần thử (FETCH_FAILED)',
      ),
    });
    const { cards, askedIndices } = await outcome;

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.some((c) => c.id.startsWith('nghe-2'))).toBe(false);
    // Đóng dấu nghề chưa quét được là lỗi tự nuôi: nó tụt cuối hàng xoay vòng rồi lại bị bỏ.
    expect(askedIndices).toEqual([0, 2]);
    expect(logs.join('\n')).toContain('nghe-2');
  });

  it('BLOCKED ở giữa lượt: dừng MỌI truy vấn còn lại nhưng giữ tin đã gom', async () => {
    const { outcome, asked } = collectWith(3, {
      'nghe-2': new Error('topcv: TopCV chặn (403, Cloudflare) (BLOCKED)'),
    });
    const { cards, askedIndices } = await outcome;

    expect(asked).toEqual(['nghe-1', 'nghe-2']);
    expect(cards.every((c) => c.id.startsWith('nghe-1'))).toBe(true);
    expect(askedIndices).toEqual([0]);
  });

  it('bị chặn ngay truy vấn đầu, chưa có tin nào: lượt vẫn hỏng với đúng lý do', async () => {
    const { outcome, asked } = collectWith(3, {
      'nghe-1': new Error('topcv: TopCV chặn (403, Cloudflare) (BLOCKED)'),
    });

    await expect(outcome).rejects.toThrow('(BLOCKED)');
    expect(asked).toEqual(['nghe-1']);
  });

  it('mọi truy vấn đều lỗi: lượt hỏng như trước, không giả vờ là "0 tin"', async () => {
    const fail = new Error('topcv: mất mạng (FETCH_FAILED)');
    const { outcome } = collectWith(2, {
      'nghe-1': fail,
      'nghe-2': fail,
    });

    await expect(outcome).rejects.toThrow('mất mạng');
  });
});
