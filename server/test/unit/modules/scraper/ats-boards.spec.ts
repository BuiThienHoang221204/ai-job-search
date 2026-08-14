import {
  boardUrl,
  htmlToText,
  normalizeAtsJobs,
  parseBoards,
  type AtsBoard,
} from 'src/modules/scraper/ats-boards.js';
import { filterByQuery } from 'src/modules/scraper/ats-source.service.js';

/*
 * Chuẩn hoá dữ liệu của ba hệ ATS. Dữ liệu mẫu dưới đây lấy từ phản hồi THẬT của
 * từng API (đã gọi và đọc), chỉ cắt bớt cho gọn — nên nếu một hệ đổi hình dạng JSON
 * thì test này còn đúng với bản cũ và ta biết mình đang so với cái gì.
 *
 * KHÔNG gọi mạng trong test: một bộ test phụ thuộc máy chủ của người khác sẽ đỏ vì
 * lý do không liên quan tới code. Việc kiểm API thật thuộc `scripts/`.
 */
const board = (vendor: AtsBoard['vendor']): AtsBoard => ({
  vendor,
  company: 'acme',
});

/// Mô tả phải dài hơn 80 ký tự, nếu không `normalizeAtsJobs` bỏ tin — nên dữ liệu mẫu
/// nào cũng cần một mô tả thật.
const LONG =
  'Chúng tôi cần một kỹ sư backend biết NestJS và PostgreSQL. '.repeat(3);

describe('parseBoards', () => {
  test('đọc danh sách nhiều board', () => {
    expect(parseBoards('greenhouse:acme,lever:beta,ashby:gamma')).toEqual([
      { vendor: 'greenhouse', company: 'acme' },
      { vendor: 'lever', company: 'beta' },
      { vendor: 'ashby', company: 'gamma' },
    ]);
  });

  test('bỏ đúng phần tử sai, giữ phần còn lại', () => {
    // Một chuỗi cấu hình sai một chỗ không được làm mất cả cấu hình: người vận hành
    // gõ thiếu dấu hai chấm thì chỉ board đó bị bỏ.
    expect(parseBoards('greenhouse:acme,khong-hop-le,workday:delta')).toEqual([
      { vendor: 'greenhouse', company: 'acme' },
    ]);
  });

  test('rỗng hoặc không khai thì không có board nào', () => {
    expect(parseBoards(undefined)).toEqual([]);
    expect(parseBoards('')).toEqual([]);
  });
});

describe('boardUrl', () => {
  test('Greenhouse PHẢI có content=true', () => {
    // Thiếu nó thì `content` vắng trong phản hồi và ta phải gọi thêm một request cho
    // TỪNG tin — chính thứ nguồn này tránh được.
    expect(boardUrl(board('greenhouse'))).toContain('content=true');
  });

  test('mỗi hệ một endpoint, và slug công ty được escape', () => {
    expect(boardUrl(board('lever'))).toBe(
      'https://api.lever.co/v0/postings/acme?mode=json',
    );
    expect(boardUrl(board('ashby'))).toBe(
      'https://api.ashbyhq.com/posting-api/job-board/acme',
    );
    expect(boardUrl({ vendor: 'greenhouse', company: 'a b/c' })).toContain(
      'a%20b%2Fc',
    );
  });
});

describe('htmlToText', () => {
  test('giải entity TRƯỚC khi bỏ thẻ', () => {
    /*
     * Greenhouse trả `content` là HTML đã escape entity. Làm ngược thứ tự thì
     * `&lt;p&gt;` biến thành `<p>` rồi NẰM LẠI trong mô tả, và trôi thẳng vào prompt
     * gửi lên model.
     */
    expect(htmlToText('&lt;p&gt;Xin chào&lt;/p&gt;')).toBe('Xin chào');
  });

  test('`&amp;` được giải CUỐI, nên chữ vẫn là chữ', () => {
    /*
     * `&amp;lt;` là cách HTML viết để HIỆN RA chữ `&lt;`. Nếu giải `&amp;` trước thì
     * nó thành `&lt;`, rồi vòng sau lại giải tiếp thành `<` — một đoạn văn bản biến
     * thành một thẻ, và thẻ đó bị bước bỏ-thẻ xoá mất luôn cả chữ bên trong.
     *
     * Thứ tự đúng cho ra đúng chữ mà tác giả muốn hiện.
     */
    expect(htmlToText('R&amp;D')).toBe('R&D');
    expect(htmlToText('&amp;lt;khong-phai-the&amp;gt;')).toBe(
      '&lt;khong-phai-the&gt;',
    );
  });

  test('thẻ khối thành ngắt dòng, không dồn chữ vào nhau', () => {
    expect(htmlToText('<p>Một</p><p>Hai</p>')).toBe('Một\nHai');
    expect(htmlToText('<li>Một</li><li>Hai</li>')).toBe('• Một\n• Hai');
  });

  test('bỏ mọi thẻ còn lại và gom khoảng trắng', () => {
    expect(htmlToText('<div><span>a</span>   <b>b</b></div>')).toBe('a b');
  });
});

describe('normalizeAtsJobs - Greenhouse', () => {
  const payload = {
    jobs: [
      {
        id: 8017323,
        title: 'Data Scientist',
        absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/8017323',
        company_name: 'ACME Corp',
        location: { name: 'Ontario' },
        first_published: '2026-06-30T20:00:33-04:00',
        updated_at: '2026-07-15T19:03:30-04:00',
        departments: [{ name: 'Analytics' }, { name: 'Corp Dev' }],
        content: `&lt;p&gt;${LONG}&lt;/p&gt;`,
      },
    ],
  };

  test('đọc đủ trường và giải HTML của mô tả', () => {
    const [card] = normalizeAtsJobs(board('greenhouse'), payload);

    expect(card.id).toBe('8017323');
    expect(card.title).toBe('Data Scientist');
    expect(card.company).toBe('ACME Corp');
    expect(card.location).toBe('Ontario');
    expect(card.tags).toEqual(['Analytics', 'Corp Dev']);
    expect(card.description).toContain('NestJS');
    // Không còn thẻ nào sót lại.
    expect(card.description).not.toMatch(/[<>]/);
  });

  test('`id` là SỐ trong JSON, phải thành chuỗi', () => {
    // `ScrapeRun`/`Job.externalId` là chuỗi. Để nguyên số thì so sánh chống trùng
    // lệch kiểu và mọi tin đều bị coi là mới.
    const [card] = normalizeAtsJobs(board('greenhouse'), payload);
    expect(typeof card.id).toBe('string');
  });

  test('`postedAt` ưu tiên first_published', () => {
    // `updated_at` đổi mỗi lần nhà tuyển dụng sửa tin, nên dùng nó thì một tin cũ
    // trông như tin vừa đăng.
    const [card] = normalizeAtsJobs(board('greenhouse'), payload);
    expect(card.postedAt).toBe('2026-06-30T20:00:33-04:00');
  });

  test('thiếu công ty thì lùi về slug của board', () => {
    const [card] = normalizeAtsJobs(board('greenhouse'), {
      jobs: [{ ...payload.jobs[0], company_name: null }],
    });
    expect(card.company).toBe('acme');
  });
});

describe('normalizeAtsJobs - Lever', () => {
  const rows = [
    {
      id: 'abc-123',
      text: 'Backend Engineer',
      hostedUrl: 'https://jobs.lever.co/acme/abc-123',
      applyUrl: 'https://jobs.lever.co/acme/abc-123/apply',
      workplaceType: 'remote',
      createdAt: 1553186035299,
      categories: {
        location: 'Arlington, TX',
        department: 'Engineering',
        team: 'Platform',
      },
      descriptionPlain: LONG,
    },
  ];

  test('payload là MẢNG ở tầng ngoài, không bọc trong `jobs`', () => {
    // Khác Greenhouse và Ashby. Đọc sai chỗ này thì luôn ra 0 tin và lượt quét được
    // ghi là "thành công".
    const cards = normalizeAtsJobs(board('lever'), rows);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('Backend Engineer');
  });

  test('`createdAt` là số mili-giây, phải đổi sang ISO', () => {
    const [card] = normalizeAtsJobs(board('lever'), rows);
    expect(card.postedAt).toBe(new Date(1553186035299).toISOString());
  });

  test('lấy hostedUrl, không lấy applyUrl', () => {
    // `hostedUrl` là trang tin; `applyUrl` là form. Assisted Apply tự tìm form từ
    // trang tin, còn lưu applyUrl thì người dùng bấm "Xem tin gốc" ra giữa form.
    const [card] = normalizeAtsJobs(board('lever'), rows);
    expect(card.url).toBe('https://jobs.lever.co/acme/abc-123');
  });
});

describe('normalizeAtsJobs - Ashby', () => {
  const payload = {
    jobs: [
      {
        id: 'x-1',
        title: 'Engineering Manager',
        jobUrl: 'https://jobs.ashbyhq.com/acme/x-1',
        location: 'Remote - EU',
        isRemote: true,
        isListed: true,
        publishedAt: '2026-05-01T00:00:00Z',
        department: 'Engineering',
        team: 'Core',
        descriptionPlain: LONG,
      },
    ],
  };

  test('đọc đủ trường và nhận ra remote', () => {
    const [card] = normalizeAtsJobs(board('ashby'), payload);
    expect(card.title).toBe('Engineering Manager');
    expect(card.workMode).toBe('remote');
    expect(card.tags).toEqual(['Engineering', 'Core']);
  });

  test('`isListed: false` thì BỎ tin', () => {
    // Tin đã rút khỏi trang tuyển dụng của họ. Lưu nó lại là mời người dùng nộp vào
    // một vị trí không còn tuyển.
    const cards = normalizeAtsJobs(board('ashby'), {
      jobs: [{ ...payload.jobs[0], isListed: false }],
    });
    expect(cards).toEqual([]);
  });
});

describe('normalizeAtsJobs - bỏ dữ liệu không dùng được', () => {
  test('mô tả quá ngắn hoặc rỗng thì BỎ', () => {
    /*
     * Toàn bộ khung chấm điểm dựa trên yêu cầu công việc, nên một tin không mô tả là
     * một bản ghi vô dụng: nó vẫn tốn một lượt gọi model rồi cho ra điểm vô nghĩa.
     */
    const cards = normalizeAtsJobs(board('greenhouse'), {
      jobs: [
        { id: 1, title: 'A', absolute_url: 'https://x/1', content: 'ngắn' },
        { id: 2, title: 'B', absolute_url: 'https://x/2', content: null },
      ],
    });
    expect(cards).toEqual([]);
  });

  test('thiếu id, url hay title thì BỎ', () => {
    const cards = normalizeAtsJobs(board('greenhouse'), {
      jobs: [
        { title: 'Không id', absolute_url: 'https://x/1', content: LONG },
        { id: 3, absolute_url: 'https://x/3', content: LONG },
        { id: 4, title: 'Không url', content: LONG },
      ],
    });
    expect(cards).toEqual([]);
  });

  test('payload sai hình dạng thì trả mảng rỗng, KHÔNG ném', () => {
    // JSON đến từ máy chủ của người khác. Ném ở đây làm cả lượt quét FAILED vì một
    // phản hồi lạ, trong khi bỏ qua thì các board còn lại vẫn chạy.
    for (const bad of [
      null,
      undefined,
      42,
      'chuỗi',
      {},
      { jobs: 'không phải mảng' },
    ]) {
      expect(normalizeAtsJobs(board('greenhouse'), bad)).toEqual([]);
      expect(normalizeAtsJobs(board('lever'), bad)).toEqual([]);
    }
  });
});

describe('filterByQuery', () => {
  const card = (title: string, description = LONG) =>
    ({
      id: title,
      slug: title,
      title,
      company: 'ACME',
      companyUrl: null,
      companyLogo: null,
      location: null,
      workMode: null,
      salary: null,
      postedAt: null,
      tags: [],
      url: 'https://x',
      description,
    }) as ReturnType<typeof normalizeAtsJobs>[number];

  const cards = [
    card('Senior DevOps Engineer'),
    card('Junior Frontend Developer'),
    card('Senior Data Engineer'),
  ];

  test('đòi MỌI từ đều khớp, không phải một từ', () => {
    // "senior devops" không nên trả về mọi tin có chữ "senior".
    expect(filterByQuery(cards, 'senior devops').map((c) => c.title)).toEqual([
      'Senior DevOps Engineer',
    ]);
  });

  test('không phân biệt chữ hoa', () => {
    expect(filterByQuery(cards, 'SENIOR DATA')).toHaveLength(1);
  });

  test('không có từ khoá thì trả tất cả', () => {
    // Đúng cho lượt quét của hệ thống: nó gộp kỹ năng của mọi hồ sơ nên không có một
    // truy vấn chung nào.
    expect(filterByQuery(cards, undefined)).toHaveLength(3);
    expect(filterByQuery(cards, '   ')).toHaveLength(3);
  });

  test('bỏ từ một ký tự', () => {
    // "a", "c" khớp gần như mọi mô tả nên chúng chỉ làm bộ lọc vô dụng.
    expect(filterByQuery(cards, 'a devops')).toHaveLength(1);
  });

  test('khớp cả trong mô tả và trong tag', () => {
    expect(filterByQuery(cards, 'nestjs')).toHaveLength(3);
  });
});
