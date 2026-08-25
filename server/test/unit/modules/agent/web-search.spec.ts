import { parseSerper } from 'src/modules/agent/tools/web-search.tool.js';

/**
 * Bóc phản hồi của Serper là chỗ dễ vỡ ÂM THẦM nhất trong cả tool.
 *
 * Serper trả nhiều khối cạnh nhau — `organic`, `knowledgeGraph`, `answerBox`,
 * `peopleAlsoAsk`. Đọc nhầm khối thì hàm trả mảng rỗng mà không có lỗi nào, và
 * agent kết luận "không tìm thấy gì về công ty này" thay vì "tra cứu hỏng".
 * Không có test này thì sai đó chỉ lộ ra khi đọc một lá thư nhạt.
 */
describe('parseSerper', () => {
  const response = {
    searchParameters: { q: 'Công ty Minh Long', gl: 'vn' },
    knowledgeGraph: { title: 'Minh Long', description: 'Gốm sứ' },
    organic: [
      {
        title: 'Công ty Cổ phần Thương mại Minh Long',
        link: 'https://minhlong.example/gioi-thieu',
        snippet: 'Doanh nghiệp thương mại thành lập năm 2010.',
        position: 1,
      },
      {
        title: 'Tuyển dụng Minh Long',
        link: 'https://vieclam.example/minh-long',
        snippet: 'Đang tuyển kế toán tổng hợp.',
        position: 2,
      },
    ],
  };

  test('lấy đúng khối organic, đổi link/snippet sang url/snippet', () => {
    const hits = parseSerper(response);

    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({
      title: 'Công ty Cổ phần Thương mại Minh Long',
      url: 'https://minhlong.example/gioi-thieu',
      snippet: 'Doanh nghiệp thương mại thành lập năm 2010.',
    });
  });

  /// Tên trường của Tavily. Nếu ai đó đổi nhà cung cấp mà quên sửa hàm này thì
  /// đây là test đỏ đầu tiên họ gặp.
  test('KHÔNG đọc nhầm định dạng của nhà cung cấp khác', () => {
    expect(
      parseSerper({
        results: [{ title: 'x', url: 'https://x.test', content: 'y' }],
      }),
    ).toEqual([]);
  });

  test('kết quả thiếu link thì bị bỏ, không tạo ra dòng rỗng', () => {
    const hits = parseSerper({
      organic: [
        { title: 'Không có link', snippet: 'gì đó' },
        response.organic[0],
      ],
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe('https://minhlong.example/gioi-thieu');
  });

  test('cắt đoạn trích quá dài', () => {
    const hits = parseSerper({
      organic: [
        { title: 't', link: 'https://a.test', snippet: 'x'.repeat(900) },
      ],
    });

    expect(hits[0].snippet).toHaveLength(600);
  });

  test.each([
    null,
    undefined,
    'chuỗi',
    42,
    [],
    {},
    { organic: 'không phải mảng' },
  ])('đầu vào %s trả mảng rỗng chứ không ném', (body) => {
    expect(parseSerper(body)).toEqual([]);
  });
});
