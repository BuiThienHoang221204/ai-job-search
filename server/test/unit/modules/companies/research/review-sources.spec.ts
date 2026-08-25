import {
  hostOf,
  pickReviewSources,
  pickSnippetSources,
  type SearchHit,
} from 'src/modules/companies/research/review-sources.js';

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
