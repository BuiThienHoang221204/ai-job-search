import {
  collectCards,
  type CollectLimits,
} from 'src/modules/scraper/ingest/collect-cards.js';
import type { PlannedQuery } from 'src/modules/scraper/planning/query-plan.js';
import type { PortalJobCard } from 'src/modules/scraper/sources/portal-cli.service.js';

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
