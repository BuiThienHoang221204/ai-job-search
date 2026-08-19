import {
  normalizeCard,
  normalizeCards,
  normalizeDetail,
  parsePostedAt,
  unwrapList,
  withinDays,
} from 'src/modules/scraper/normalize.js';

/// Hình dạng thật của itviec / topcv / vietnamworks: mảng trần.
const arrayShape = [
  {
    id: '123',
    slug: 'lap-trinh-vien/123',
    title: 'Lập trình viên',
    company: 'Công ty A',
    companyUrl: 'https://a.vn/cong-ty',
    location: 'Hà Nội',
    workMode: 'At office',
    salary: 'Tới 30 triệu',
    postedAt: '2 ngày trước',
    tags: ['React', 'Node'],
    url: 'https://a.vn/viec-lam/123',
  },
];

/// Hình dạng thật của linkedin-search (framework upstream).
const linkedInShape = {
  meta: { count: 1, page: 1 },
  results: [
    {
      id: '4270521424',
      title: 'ReactJS Developer',
      company: 'CMC Global',
      companyUrl: 'https://vn.linkedin.com/company/cmc-global',
      location: 'Hai Duong, Vietnam',
      date: '2025-07-21',
      url: 'https://vn.linkedin.com/jobs/view/reactjs-developer-4270521424',
    },
  ],
};

describe('unwrapList', () => {
  test('mảng trần đi qua nguyên vẹn', () => {
    expect(unwrapList(arrayShape)).toHaveLength(1);
  });

  test('bóc được mảng trong {results}', () => {
    expect(unwrapList(linkedInShape)).toHaveLength(1);
  });

  test('bóc được các tên bao bì khác', () => {
    expect(unwrapList({ jobs: [1, 2] })).toHaveLength(2);
    expect(unwrapList({ data: [1] })).toHaveLength(1);
    expect(unwrapList({ items: [1, 2, 3] })).toHaveLength(3);
  });

  test('thứ tự ưu tiên cố định khi có nhiều bao bì', () => {
    // Không cố định thì hai lần chạy có thể cho kết quả khác nhau.
    expect(unwrapList({ data: ['d'], results: ['r'] })).toEqual(['r']);
  });

  test('không phải mảng hay object thì trả rỗng, không nổ', () => {
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapList('chuỗi')).toEqual([]);
    expect(unwrapList(undefined)).toEqual([]);
    expect(unwrapList({ khong: 'co mang' })).toEqual([]);
  });
});

describe('normalizeCard', () => {
  test('giữ nguyên mọi trường của hình dạng mảng trần', () => {
    const card = normalizeCard(arrayShape[0])!;
    expect(card).toMatchObject({
      id: '123',
      slug: 'lap-trinh-vien/123',
      title: 'Lập trình viên',
      salary: 'Tới 30 triệu',
      tags: ['React', 'Node'],
    });
  });

  test('url được giữ lại', () => {
    // Thiếu test này nên bản đầu tiên kiểm tra url rồi quên đưa vào kết quả;
    // chỉ có trình biên dịch bắt được.
    expect(normalizeCard(arrayShape[0])!.url).toBe('https://a.vn/viec-lam/123');
    expect(normalizeCard(linkedInShape.results[0])!.url).toBe(
      'https://vn.linkedin.com/jobs/view/reactjs-developer-4270521424',
    );
  });

  test('linkedin: date được đổi thành postedAt', () => {
    const card = normalizeCard(linkedInShape.results[0])!;
    expect(card.postedAt).toBe('2025-07-21');
  });

  test('linkedin: thiếu slug thì suy từ id', () => {
    // slug là thứ backend truyền lại cho lệnh detail, nên phải là chuỗi mà
    // chính CLI đó nhận lại được. CLI của LinkedIn nhận id dạng số.
    const card = normalizeCard(linkedInShape.results[0])!;
    expect(card.slug).toBe('4270521424');
  });

  test('trường vắng mặt thành null chứ không thành undefined', () => {
    const card = normalizeCard(linkedInShape.results[0])!;
    expect(card.salary).toBeNull();
    expect(card.workMode).toBeNull();
    expect(card.tags).toEqual([]);
  });

  test('thiếu id, title hoặc url thì trả null', () => {
    expect(normalizeCard({ title: 'x', url: 'u' })).toBeNull();
    expect(normalizeCard({ id: '1', url: 'u' })).toBeNull();
    expect(normalizeCard({ id: '1', title: 'x' })).toBeNull();
  });

  test('chuỗi rỗng hoặc toàn khoảng trắng bị coi là thiếu', () => {
    expect(normalizeCard({ id: '1', title: '   ', url: 'u' })).toBeNull();
  });

  test('không phải object thì trả null', () => {
    expect(normalizeCard(null)).toBeNull();
    expect(normalizeCard('chuỗi')).toBeNull();
  });

  test('tags lẫn phần tử không phải chuỗi thì bị loại', () => {
    const card = normalizeCard({
      id: '1',
      title: 'x',
      url: 'u',
      tags: ['ok', 42, null, 'tot'],
    })!;
    expect(card.tags).toEqual(['ok', 'tot']);
  });

  test('KHÔNG đặt description khi CLI không trả về', () => {
    // ScraperService phân biệt "có sẵn mô tả" với "chưa lấy" để quyết định có
    // gọi detail hay không. Đặt null vô tội vạ sẽ khiến nó gọi detail cả với
    // portal đã có sẵn mô tả.
    const card = normalizeCard(arrayShape[0])!;
    expect('description' in card).toBe(false);
  });

  test('CÓ đặt description khi CLI trả về (vietnamworks)', () => {
    const card = normalizeCard({
      id: '1',
      title: 'x',
      url: 'u',
      description: 'Mô tả công việc đầy đủ',
    })!;
    expect(card.description).toBe('Mô tả công việc đầy đủ');
  });
});

describe('normalizeCards', () => {
  test('xử lý được cả hai hình dạng bằng một đường', () => {
    expect(normalizeCards(arrayShape)).toHaveLength(1);
    expect(normalizeCards(linkedInShape)).toHaveLength(1);
  });

  test('bỏ những bản ghi hỏng, giữ phần còn lại', () => {
    const cards = normalizeCards([
      arrayShape[0],
      { thieu: 'het' },
      null,
      { ...arrayShape[0], id: '456' },
    ]);
    expect(cards).toHaveLength(2);
  });

  test('đầu vào rác trả mảng rỗng thay vì nổ', () => {
    // "cards is not iterable" đã xảy ra thật khi CLI trả về object.
    expect(normalizeCards({ meta: {} })).toEqual([]);
    expect(normalizeCards(null)).toEqual([]);
  });
});

describe('normalizeDetail', () => {
  test('lấy được mô tả', () => {
    const detail = normalizeDetail({
      ...linkedInShape.results[0],
      description: 'Nội dung công việc',
    })!;
    expect(detail.description).toBe('Nội dung công việc');
    expect(detail.title).toBe('ReactJS Developer');
  });

  test('không có mô tả thì description là null', () => {
    expect(normalizeDetail(linkedInShape.results[0])!.description).toBeNull();
  });

  test('bản ghi hỏng trả null để phía gọi ném lỗi rõ ràng', () => {
    expect(normalizeDetail({ thieu: 'het' })).toBeNull();
  });
});

describe('parsePostedAt', () => {
  /// Mốc cố định để phép trừ ra kết quả đoán trước được, không phụ thuộc lúc
  /// chạy test.
  const now = new Date('2026-08-10T12:00:00Z');
  const day = (value: Date | null) => value?.toISOString().slice(0, 10);

  test('itviec: chuỗi tiếng Anh tương đối', () => {
    expect(day(parsePostedAt('1 day ago', now))).toBe('2026-08-09');
    expect(day(parsePostedAt('4 days ago', now))).toBe('2026-08-06');
  });

  test('itviec: "a day ago" / "an hour ago" nghĩa là 1', () => {
    expect(day(parsePostedAt('a day ago', now))).toBe('2026-08-09');
    expect(day(parsePostedAt('an hour ago', now))).toBe('2026-08-10');
  });

  test('linkedin: ngày ISO', () => {
    expect(day(parsePostedAt('2025-07-21', now))).toBe('2025-07-21');
    expect(day(parsePostedAt('2025-07-21T09:30:00Z', now))).toBe('2025-07-21');
  });

  test('dd/mm/yyyy đọc theo kiểu Việt, không phải mm/dd', () => {
    // 07/08 phải là 7 tháng 8, không phải 8 tháng 7 như Date.parse hiểu.
    expect(day(parsePostedAt('07/08/2026', now))).toBe('2026-08-07');
  });

  test('tiếng Việt có dấu và không dấu đều đọc được', () => {
    expect(day(parsePostedAt('2 ngày trước', now))).toBe('2026-08-08');
    expect(day(parsePostedAt('2 ngay truoc', now))).toBe('2026-08-08');
    expect(day(parsePostedAt('3 tuần trước', now))).toBe('2026-07-20');
  });

  test('thiếu dữ liệu trả null chứ không đoán', () => {
    expect(parsePostedAt(null, now)).toBeNull();
    expect(parsePostedAt('', now)).toBeNull();
    expect(parsePostedAt('   ', now)).toBeNull();
    expect(parsePostedAt('Tuyển gấp', now)).toBeNull();
  });

  test('mốc TƯƠNG LAI không bị trừ ngược thành ngày đăng', () => {
    // "Hạn nộp 3 ngày" có đủ số và đơn vị nhưng không nói về quá khứ; trừ đi
    // sẽ ra một ngày đăng hoàn toàn bịa.
    expect(parsePostedAt('Hạn nộp 3 ngày', now)).toBeNull();
    expect(parsePostedAt('2030-01-01', now)).toBeNull();
  });
});

describe('withinDays', () => {
  const now = new Date('2026-08-10T12:00:00Z');

  test('tin trong cửa sổ thì giữ', () => {
    expect(withinDays('2 ngày trước', 7, false, now)).toBe(true);
    expect(withinDays('2026-08-05', 7, false, now)).toBe(true);
  });

  test('tin ngoài cửa sổ thì loại', () => {
    expect(withinDays('3 tuần trước', 7, false, now)).toBe(false);
    expect(withinDays('2026-07-01', 7, false, now)).toBe(false);
  });

  test('đúng biên 7 ngày vẫn tính là trong cửa sổ', () => {
    expect(withinDays('7 ngày trước', 7, false, now)).toBe(true);
    expect(withinDays('8 ngày trước', 7, false, now)).toBe(false);
  });

  test('không đọc được ngày: mặc định giữ, strict thì loại', () => {
    expect(withinDays(null, 7, false, now)).toBe(true);
    expect(withinDays('Tuyển gấp', 7, false, now)).toBe(true);
    expect(withinDays(null, 7, true, now)).toBe(false);
  });
});
