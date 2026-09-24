import {
  confidenceOf,
  hostOf,
  pickReviewSources,
  pickSnippetSources,
  stripChrome,
  trimToReviewText,
  type SearchHit,
} from 'src/modules/companies/utils/review-sources.js';

const hit = (url: string, title = 'x'): SearchHit => ({
  url,
  title,
  snippet: '',
});

const withSnippet = (url: string, snippet: string): SearchHit => ({
  url,
  title: 'x',
  snippet,
});

const LONG_SNIPPET =
  'Có ai đã phỏng vấn ở công ty này chưa ạ? Cho em xin review để cần ôn những gì ạ.';

describe('hostOf', () => {
  test('bỏ www và giữ tên miền con', () => {
    expect(hostOf('https://www.topcv.vn/cong-ty/abc')).toBe('topcv.vn');
    expect(hostOf('https://vn.indeed.com/cmp/abc')).toBe('vn.indeed.com');
  });

  test('trả null cho URL không dùng được', () => {
    expect(hostOf('không phải url')).toBeNull();
    expect(hostOf('javascript:alert(1)')).toBeNull();
    expect(hostOf('ftp://itviec.com/x')).toBeNull();
  });
});

describe('pickReviewSources', () => {
  test('xếp trang đánh giá lên trước kết quả lạ', () => {
    const picked = pickReviewSources([
      hit('https://blog-la.com/fpt'),
      hit('https://itviec.com/companies/fpt-software/review'),
    ]);

    expect(picked.map((h) => hostOf(h.url))).toEqual([
      'itviec.com',
      'blog-la.com',
    ]);
  });

  test('bỏ tin tuyển dụng, giữ trang công ty cùng tên miền', () => {
    const picked = pickReviewSources([
      hit('https://itviec.com/it-jobs/senior-java-fpt-software-123'),
      hit('https://itviec.com/companies/fpt-software/review'),
      hit('https://www.topcv.vn/viec-lam/ke-toan-fpt/999.html'),
    ]);

    expect(picked.map((h) => h.url)).toEqual([
      'https://itviec.com/companies/fpt-software/review',
    ]);
  });

  test('bỏ mạng xã hội và video', () => {
    const picked = pickReviewSources([
      hit('https://www.facebook.com/groups/123/posts/456'),
      hit('https://www.youtube.com/watch?v=abc'),
      hit('https://www.linkedin.com/company/fpt-software'),
      hit('https://reviewcongty.com/fpt-software'),
    ]);

    expect(picked.map((h) => hostOf(h.url))).toEqual(['reviewcongty.com']);
  });

  test('mỗi tên miền chỉ lấy một trang, giữ trang Google xếp trên', () => {
    const picked = pickReviewSources([
      hit('https://reviewcongty.com/fpt-software'),
      hit('https://reviewcongty.com/fpt-telecom'),
    ]);

    expect(picked.map((h) => h.url)).toEqual([
      'https://reviewcongty.com/fpt-software',
    ]);
  });

  test('giữ nguyên thứ tự của Google giữa các trang cùng hạng', () => {
    const picked = pickReviewSources([
      hit('https://bao-b.vn/fpt'),
      hit('https://bao-a.vn/fpt'),
    ]);

    expect(picked.map((h) => hostOf(h.url))).toEqual(['bao-b.vn', 'bao-a.vn']);
  });

  test('tôn trọng trần số trang', () => {
    const hits = Array.from({ length: 9 }, (_, i) =>
      hit(`https://site-${i}.vn/fpt`),
    );

    expect(pickReviewSources(hits, 3)).toHaveLength(3);
  });

  test('không có gì đọc được thì trả mảng rỗng, không ném lỗi', () => {
    expect(pickReviewSources([])).toEqual([]);
    expect(
      pickReviewSources([hit('url hỏng'), hit('https://x.com/a')]),
    ).toEqual([]);
  });
});

/// Facebook không tải được vì tường đăng nhập, nhưng đoạn trích Google đã trả
/// tiền rồi. Với công ty nhỏ, bài hỏi trong nhóm FB thường là tín hiệu
/// người-thật duy nhất tồn tại.
describe('pickSnippetSources', () => {
  test('giữ bài Facebook có đoạn trích đủ dài', () => {
    const picked = pickSnippetSources([
      withSnippet('https://www.facebook.com/groups/1/posts/2/', LONG_SNIPPET),
    ]);

    expect(picked).toHaveLength(1);
  });

  test('bỏ đoạn trích quá ngắn - đó chỉ là tiêu đề lặp lại', () => {
    expect(
      pickSnippetSources([
        withSnippet('https://www.facebook.com/groups/1/posts/2/', 'Smartbooks'),
      ]),
    ).toEqual([]);
  });

  test('không lấy nguồn vốn đã tải được - tránh đếm hai lần', () => {
    const picked = pickSnippetSources([
      withSnippet('https://itviec.com/companies/abc/review', LONG_SNIPPET),
      withSnippet('https://www.youtube.com/watch?v=1', LONG_SNIPPET),
    ]);

    expect(picked).toEqual([]);
  });

  test('mỗi tên miền một mục và tôn trọng trần', () => {
    const picked = pickSnippetSources(
      [
        withSnippet('https://www.facebook.com/groups/1/posts/2/', LONG_SNIPPET),
        withSnippet('https://www.facebook.com/groups/9/posts/9/', LONG_SNIPPET),
        withSnippet('https://www.threads.net/@a/post/1', LONG_SNIPPET),
      ],
      2,
    );

    expect(picked.map((h) => hostOf(h.url))).toEqual([
      'facebook.com',
      'threads.net',
    ]);
  });
});

/// Trang công ty TopCV đo được 9.263 ký tự mà phần lớn là banner cookie. Không
/// cắt thì nó chiếm mất ngân sách của nội dung thật.
describe('stripChrome', () => {
  test('bỏ dòng banner cookie và điều khoản', () => {
    const text = [
      'TopCV sử dụng cookie để đảm bảo tính năng thiết yếu.',
      'Môi trường làm việc thoải mái, sếp dễ chịu.',
      'Chấp nhận tất cả',
      'Xem chính sách bảo mật của chúng tôi.',
    ].join('\n');

    expect(stripChrome(text)).toBe(
      'Môi trường làm việc thoải mái, sếp dễ chịu.',
    );
  });

  test('không đụng tới nội dung thật', () => {
    const text = 'Lương ổn, đồng nghiệp thân thiện.\nQuản lý hơi xa cách.';
    expect(stripChrome(text)).toBe(text);
  });
});

const filler = (n: number) => 'x'.repeat(n);

describe('trimToReviewText', () => {
  test('trang ngắn hơn ngân sách thì giữ nguyên', () => {
    const text = 'Công ty này môi trường tốt';
    expect(trimToReviewText(text, 5_000)).toBe(text);
  });

  test('giữ đoạn quanh từ khoá, bỏ phần nhiễu ở xa', () => {
    const text = `${filler(3_000)} lương ở đây khá ổn ${filler(3_000)}`;
    const trimmed = trimToReviewText(text, 2_000);

    expect(trimmed).toContain('lương ở đây khá ổn');
    expect(trimmed.length).toBeLessThanOrEqual(2_000);
  });

  test('gộp hai từ khoá gần nhau thành một đoạn liền', () => {
    const text = `${filler(2_000)} môi trường tốt, đồng nghiệp thân thiện ${filler(2_000)}`;
    const trimmed = trimToReviewText(text, 2_000);

    expect(trimmed).toContain('môi trường tốt, đồng nghiệp thân thiện');
    expect(trimmed.split('…')).toHaveLength(1);
  });

  test('hai vùng cách xa nhau được nối bằng dấu lược', () => {
    const text = `${filler(200)} lương cao ${filler(4_000)} quản lý tệ ${filler(200)}`;
    const trimmed = trimToReviewText(text, 3_000);

    expect(trimmed).toContain('lương cao');
    expect(trimmed).toContain('quản lý tệ');
    expect(trimmed).toContain('…');
    expect(trimmed.length).toBeLessThanOrEqual(3_000);
  });

  test('bắt được cả bản viết không dấu', () => {
    const text = `${filler(3_000)} moi truong lam viec ok ${filler(3_000)}`;
    expect(trimToReviewText(text, 2_000)).toContain('moi truong lam viec ok');
  });

  test('không có từ khoá nào thì cắt từ đầu, không trả rỗng', () => {
    const text = filler(9_000);
    const trimmed = trimToReviewText(text, 1_000);

    expect(trimmed).toHaveLength(1_000);
  });

  test('không bao giờ vượt ngân sách dù trang lặp từ khoá dày đặc', () => {
    const text = 'lương thưởng phúc lợi môi trường quản lý '.repeat(500);
    expect(trimToReviewText(text, 1_500).length).toBeLessThanOrEqual(1_500);
  });
});

/// Chọn theo thứ tự trang đã đo là hỏng trên trang công ty TopCV: khẩu hiệu đầu
/// trang chứa đúng một từ khoá nhưng nằm trên cùng nên chiếm hết ngân sách.
describe('trimToReviewText ưu tiên theo mật độ', () => {
  /// Cả hai vùng đều nằm giữa trang nên cửa sổ của chúng bằng nhau; ngân sách
  /// vừa đủ MỘT cửa sổ, nên test kiểm đúng thứ tự ưu tiên chứ không phụ thuộc
  /// vào việc cửa sổ dài bao nhiêu.
  const THUA = 'Kết nối bền chặt cùng đồng nghiệp cũng là một lợi thế. ';
  const DAC = 'Lương ổn, phúc lợi tốt, quản lý quan tâm, văn hóa cởi mở.';
  const TRANG = `${filler(1_000)}${THUA}${filler(2_000)}${DAC}${filler(1_000)}`;
  const MOT_CUA_SO = 800;

  test('vùng đặc từ khoá thắng vùng thưa nằm trước nó', () => {
    const trimmed = trimToReviewText(TRANG, MOT_CUA_SO);

    expect(trimmed).toContain('quản lý quan tâm');
    expect(trimmed).not.toContain('lợi thế');
  });

  test('ngân sách rộng thì vùng thưa vẫn được lấy, chỉ là xếp sau', () => {
    const trimmed = trimToReviewText(TRANG, MOT_CUA_SO * 2 + 100);

    expect(trimmed).toContain('quản lý quan tâm');
    expect(trimmed).toContain('lợi thế');
  });

  test('giữ thứ tự trang khi in ra, dù chọn theo mật độ', () => {
    const dau = 'Lương thưởng phúc lợi quản lý văn hóa môi trường đồng nghiệp.';
    const cuoi =
      'Lương thưởng phúc lợi quản lý văn hóa môi trường đồng nghiệp tăng ca.';
    const trimmed = trimToReviewText(
      `${dau}${filler(3_000)} sếp ${filler(3_000)}${cuoi}`,
      2_500,
    );

    expect(trimmed.indexOf('đồng nghiệp.')).toBeLessThan(
      trimmed.indexOf('tăng ca'),
    );
  });
});

describe('confidenceOf', () => {
  test('không đọc được nguồn nào thì thấp', () => {
    expect(confidenceOf([])).toBe('low');
  });

  test('một trang đánh giá chuyên là chưa đủ để lên cao', () => {
    expect(confidenceOf(['https://itviec.com/companies/fpt/review'])).toBe(
      'medium',
    );
  });

  test('trang đánh giá chuyên cộng thêm nguồn khác thì cao', () => {
    expect(
      confidenceOf([
        'https://itviec.com/companies/fpt/review',
        'https://blog-nao-do.vn/fpt',
      ]),
    ).toBe('high');
  });

  test('toàn nguồn lạ thì không bao giờ lên cao', () => {
    expect(confidenceOf(['https://a.vn/x', 'https://b.vn/x'])).toBe('low');
    expect(
      confidenceOf(['https://a.vn/x', 'https://b.vn/x', 'https://c.vn/x']),
    ).toBe('medium');
  });
});
