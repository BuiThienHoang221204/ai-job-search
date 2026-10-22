import type { ConfigService } from '@nestjs/config';
import type { WebLimits } from 'src/common/web/web-limits.js';
import { ReviewResearchService } from 'src/modules/companies/services/review-research.service.js';

const TAVILY_URL = 'https://tavily.example/search';
const SERPER_URL = 'https://serper.example/search';

const build = (keys: { tavily: string; serper: string }) => {
  const web: WebLimits = {
    fetchTimeoutMs: 1_000,
    fetchMaxBytes: 1_000,
    search: {
      maxResults: 5,
      tavily: { apiKey: keys.tavily, url: TAVILY_URL },
      serper: { apiKey: keys.serper, url: SERPER_URL },
    },
  };
  return new ReviewResearchService({
    get: () => web,
  } as unknown as ConfigService);
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

const TAVILY_BODY = {
  results: [{ title: 'T', url: 'https://t.example', content: 'tavily' }],
};
const SERPER_BODY = {
  organic: [{ title: 'S', link: 'https://s.example', snippet: 'serper' }],
};

describe('ReviewResearchService.search', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock<Promise<Response>, [string]>;

  const calledUrls = () => fetchMock.mock.calls.map((call) => call[0]);

  beforeEach(() => {
    fetchMock = jest.fn<Promise<Response>, [string]>();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('Tavily chạy được thì không gọi Serper', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, TAVILY_BODY));

    const hits = await build({ tavily: 't', serper: 's' }).search('q');

    expect(hits.map((hit) => hit.snippet)).toEqual(['tavily']);
    expect(calledUrls()).toEqual([TAVILY_URL]);
  });

  test('Tavily hết hạn mức tháng thì sang Serper', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(432, { detail: { error: 'usage limit' } }))
      .mockResolvedValueOnce(reply(200, SERPER_BODY));

    const hits = await build({ tavily: 't', serper: 's' }).search('q');

    expect(hits.map((hit) => hit.snippet)).toEqual(['serper']);
    expect(calledUrls()).toEqual([TAVILY_URL, SERPER_URL]);
  });

  test('không có key Tavily thì gọi thẳng Serper', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, SERPER_BODY));

    const service = build({ tavily: '', serper: 's' });

    expect(service.enabled).toBe(true);
    expect(await service.search('q')).toHaveLength(1);
    expect(calledUrls()).toEqual([SERPER_URL]);
  });
});
