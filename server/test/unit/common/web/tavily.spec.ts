import { parseTavily } from 'src/common/web/tavily.js';

describe('parseTavily', () => {
  test('lấy khối results, đổi content sang snippet, bỏ mục không có url', () => {
    const hits = parseTavily({
      query: 'review công ty Minh Long',
      answer: null,
      results: [
        {
          title: 'Review Minh Long',
          url: 'https://review.example/minh-long',
          content: 'Môi trường làm việc thân thiện.',
          score: 0.8,
        },
        { title: 'Không có link', content: 'x' },
      ],
    });

    expect(hits).toEqual([
      {
        title: 'Review Minh Long',
        url: 'https://review.example/minh-long',
        snippet: 'Môi trường làm việc thân thiện.',
      },
    ]);
  });

  test('phản hồi sai hình dạng trả mảng rỗng', () => {
    expect(parseTavily({ organic: [] })).toEqual([]);
    expect(parseTavily(null)).toEqual([]);
  });
});
