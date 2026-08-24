/*
 * `CompanyService` nạp `AiService` để lấy token DI, mà `AiService` nạp `ai` và
 * `@ai-sdk/openai-compatible` — hai package ESM thuần jest không `require()`
 * được. Lời gọi model đi qua `FakeAi` nên chặn ở tầng module là đủ.
 */
jest.mock('ai', () => ({}));
jest.mock('@ai-sdk/openai-compatible', () => ({}));

import type { AiService } from 'src/modules/ai/services/ai.service.js';
import { CompanyService } from 'src/modules/companies/company.service.js';
import type { ReviewResearchService } from 'src/modules/companies/research/review-research.service.js';
import type { SearchHit } from 'src/modules/companies/research/review-sources.js';
import type { PrismaService } from 'src/prisma/prisma.service.js';
import { FakeAi } from 'src/testing/fake-ai.js';

const brief = (over: Record<string, unknown> = {}) => ({
  verdict: 'mixed',
  summary: 'Môi trường ổn cho người mới, lương tăng chậm.',
  pros: ['Đào tạo bài bản'],
  cons: ['Lương thấp'],
  rating: 3.7,
  reviewCount: 2187,
  usedSources: [{ index: 1, usedFor: 'Điểm trung bình' }],
  ...over,
});

const hit = (url: string, snippet = ''): SearchHit => ({
  url,
  title: url,
  snippet,
});

/** Ghi lại mọi lượt upsert để test đọc được thứ thật sự định ghi vào database. */
function fakePrisma() {
  const saved: Array<Record<string, unknown>> = [];
  const prisma = {
    companyBrief: {
      findUnique: jest.fn(() => Promise.resolve(null)),
      upsert: jest.fn((args: { create: Record<string, unknown> }) => {
        saved.push(args.create);
        return Promise.resolve(args.create);
      }),
    },
  };
  return { prisma: prisma as unknown as PrismaService, saved, spy: prisma };
}

function fakeResearch(
  hits: SearchHit[],
  pages: Record<string, string | null> = {},
  enabled = true,
) {
  const searched: string[] = [];
  const read: string[] = [];
  const service = {
    get enabled() {
      return enabled;
    },
    search: (query: string) => {
      searched.push(query);
      return Promise.resolve(hits);
    },
    readPage: (url: string) => {
      read.push(url);
      return Promise.resolve(pages[url] ?? null);
    },
  };
  return {
    research: service as unknown as ReviewResearchService,
    searched,
    read,
  };
}

const LONG = 'Nhân viên nói môi trường ở đây khá ổn. '.repeat(30);

describe('CompanyService.find', () => {
  test('tên ẩn danh thì trả null mà không đụng database', async () => {
    const { prisma, spy } = fakePrisma();
    const { research } = fakeResearch([]);
    const service = new CompanyService(
      prisma,
      new FakeAi() as unknown as AiService,
      research,
    );

    expect(await service.find('Công ty bảo mật')).toBeNull();
    expect(spy.companyBrief.findUnique).not.toHaveBeenCalled();
  });

  test('tra bằng khoá đã chuẩn hoá, không bằng tên thô', async () => {
    const { prisma, spy } = fakePrisma();
    const { research } = fakeResearch([]);
    const service = new CompanyService(
      prisma,
      new FakeAi() as unknown as AiService,
      research,
    );

    await service.find('Công ty TNHH FPT Software');

    expect(spy.companyBrief.findUnique).toHaveBeenCalledWith({
      where: { nameKey: 'fpt software' },
    });
  });
});

describe('CompanyService.build', () => {
  test('tìm ba câu, đọc nguồn, gọi model đúng MỘT lần', async () => {
    const { prisma, saved } = fakePrisma();
    const url = 'https://itviec.com/companies/fpt-software/review';
    const { research, searched, read } = fakeResearch([hit(url)], {
      [url]: LONG,
    });
    const ai = new FakeAi().willReturn(brief());

    await new CompanyService(
      prisma,
      ai as unknown as AiService,
      research,
    ).build('FPT Software');

    expect(searched).toHaveLength(3);
    expect(searched[0]).toContain('FPT Software');
    expect(read).toEqual([url]);
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].purpose).toBe('company.brief');
    expect(ai.pending).toBe(0);
    expect(saved[0].verdict).toBe('MIXED');
  });

  test('nguồn được đánh số trong prompt và model dẫn nguồn bằng số đó', async () => {
    const { prisma, saved } = fakePrisma();
    const url = 'https://reviewcongty.com/fpt';
    const { research } = fakeResearch([hit(url)], { [url]: LONG });
    const ai = new FakeAi().willReturn(brief());

    await new CompanyService(
      prisma,
      ai as unknown as AiService,
      research,
    ).build('FPT Software');

    expect(ai.calls[0].prompt).toContain('### NGUỒN 1');
    expect(saved[0].sources).toEqual([
      { url, title: url, usedFor: 'Điểm trung bình', status: 'read' },
    ]);
  });

  test('số thứ tự nguồn model bịa ra bị bỏ, không dựng thành nguồn rỗng', async () => {
    const { prisma, saved } = fakePrisma();
    const url = 'https://reviewcongty.com/fpt';
    const { research } = fakeResearch([hit(url)], { [url]: LONG });
    const ai = new FakeAi().willReturn(
      brief({
        usedSources: [
          { index: 1, usedFor: 'thật' },
          { index: 9, usedFor: 'bịa' },
          { index: 1, usedFor: 'trùng' },
        ],
      }),
    );

    await new CompanyService(
      prisma,
      ai as unknown as AiService,
      research,
    ).build('FPT Software');

    expect(saved[0].sources).toEqual([
      { url, title: url, usedFor: 'thật', status: 'read' },
    ]);
  });

  /// Trang chết vẫn được GHI LẠI, không biến mất: người dùng cần biết chỗ nào
  /// đã tra rồi, nếu không thẻ này còn tệ hơn danh sách link của Google.
  test('trang tải hỏng vẫn vào danh sách đã kiểm, và không vào prompt', async () => {
    const { prisma, saved } = fakePrisma();
    const ok = 'https://itviec.com/companies/fpt/review';
    const dead = 'https://reviewcongty.com/fpt';
    const { research } = fakeResearch([hit(ok), hit(dead)], {
      [ok]: LONG,
      [dead]: null,
    });
    const ai = new FakeAi().willReturn(brief());

    await new CompanyService(
      prisma,
      ai as unknown as AiService,
      research,
    ).build('FPT Software');

    expect(saved[0].sources).toEqual([
      { url: ok, title: ok, usedFor: 'Điểm trung bình', status: 'read' },
      { url: dead, title: dead, usedFor: null, status: 'unreachable' },
    ]);
    expect(ai.calls[0].prompt).not.toContain(dead);
  });

  /// Facebook không tải được, nhưng đoạn trích Google đã trả tiền rồi - với
  /// công ty nhỏ đó thường là tín hiệu người-thật duy nhất tồn tại.
  test('nguồn chặn được đưa vào bằng đoạn trích, có ghi rõ là đoạn trích', async () => {
    const { prisma, saved } = fakePrisma();
    const page = 'https://itviec.com/companies/abc/review';
    const fb = 'https://www.facebook.com/groups/1/posts/2/';
    const snippet =
      'Có ai đã phỏng vấn ở công ty này chưa ạ? Cho em xin review với ạ.';
    const { research } = fakeResearch([hit(page), hit(fb, snippet)], {
      [page]: LONG,
    });
    const ai = new FakeAi().willReturn(
      brief({
        usedSources: [{ index: 2, usedFor: 'ý kiến người đi phỏng vấn' }],
      }),
    );

    await new CompanyService(
      prisma,
      ai as unknown as AiService,
      research,
    ).build('Công ty ABC');

    expect(ai.calls[0].prompt).toContain(snippet);
    expect(ai.calls[0].prompt).toContain('chỉ là đoạn trích ngắn');
    expect(saved[0].sources).toEqual([
      { url: page, title: page, usedFor: null, status: 'read' },
      {
        url: fb,
        title: fb,
        usedFor: 'ý kiến người đi phỏng vấn',
        status: 'snippet',
      },
    ]);
  });

  /// Model không rút ra được gì từ một trang KHÔNG có nghĩa là trang đó biến
  /// mất khỏi báo cáo. "Đã tra ITviec, chưa ai đánh giá" là câu trả lời có ích.
  test('nguồn đã đọc mà model không dùng vẫn được giữ với usedFor rỗng', async () => {
    const { prisma, saved } = fakePrisma();
    const url = 'https://itviec.com/companies/abc/review';
    const { research } = fakeResearch([hit(url)], { [url]: LONG });
    const ai = new FakeAi().willReturn(
      brief({ verdict: 'no_reviews_yet', usedSources: [] }),
    );

    await new CompanyService(
      prisma,
      ai as unknown as AiService,
      research,
    ).build('Công ty ABC');

    expect(saved[0].verdict).toBe('NO_REVIEWS_YET');
    expect(saved[0].sources).toEqual([
      { url, title: url, usedFor: null, status: 'read' },
    ]);
    expect(saved[0].confidence).toBe('LOW');
  });

  test('không đọc được nguồn nào thì lưu bản "unknown" và KHÔNG gọi model', async () => {
    const { prisma, saved } = fakePrisma();
    const { research } = fakeResearch([]);
    const ai = new FakeAi();

    await new CompanyService(
      prisma,
      ai as unknown as AiService,
      research,
    ).build('Công ty Vô Danh ABC');

    expect(ai.calls).toHaveLength(0);
    expect(saved[0].verdict).toBe('UNKNOWN');
    expect(saved[0].confidence).toBe('LOW');
    expect(saved[0].sources).toEqual([]);
  });

  test('chưa cấu hình khoá tìm kiếm thì không gọi mạng', async () => {
    const { prisma } = fakePrisma();
    const { research, searched } = fakeResearch([], {}, false);
    const ai = new FakeAi();

    await new CompanyService(
      prisma,
      ai as unknown as AiService,
      research,
    ).build('FPT Software');

    expect(searched).toEqual([]);
    expect(ai.calls).toHaveLength(0);
  });

  test('độ tin cậy do code suy ra từ nguồn, không lấy từ model', async () => {
    const { prisma, saved } = fakePrisma();
    const a = 'https://itviec.com/companies/fpt/review';
    const b = 'https://blog-la.vn/fpt';
    const { research } = fakeResearch([hit(a), hit(b)], {
      [a]: LONG,
      [b]: LONG,
    });
    const ai = new FakeAi().willReturn(
      brief({
        usedSources: [
          { index: 1, usedFor: 'điểm số' },
          { index: 2, usedFor: 'ý kiến' },
        ],
      }),
    );

    await new CompanyService(
      prisma,
      ai as unknown as AiService,
      research,
    ).build('FPT Software');

    expect(saved[0].confidence).toBe('HIGH');
  });

  test('công ty ẩn danh thì từ chối ngay, không tốn lượt tìm kiếm', async () => {
    const { prisma } = fakePrisma();
    const { research, searched } = fakeResearch([]);
    const service = new CompanyService(
      prisma,
      new FakeAi() as unknown as AiService,
      research,
    );

    await expect(service.build('Confidential')).rejects.toThrow(/ẩn danh/);
    expect(searched).toEqual([]);
  });
});
