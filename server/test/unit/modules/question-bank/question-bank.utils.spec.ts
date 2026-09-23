import {
  byCount,
  decorate,
  NO_SAMPLE_ANSWER,
  occupationName,
  questionFilters,
  questionWhere,
  typeLabel,
} from 'src/modules/question-bank/question-bank.utils.js';

describe('questionFilters', () => {
  test('không lọc gì thì cả bốn mảnh đều rỗng', () => {
    expect(questionFilters()).toEqual({
      search: {},
      industry: {},
      type: {},
      difficulty: {},
    });
  });

  test('tách từng chiều thành một mảnh riêng', () => {
    const filters = questionFilters({
      industry: 'FIN_ACCOUNTING',
      type: 'HANH_VI',
      difficulty: 'Khó',
      q: 'quản lý',
    });

    expect(filters.industry).toEqual({ industry: 'FIN_ACCOUNTING' });
    expect(filters.type).toEqual({ type: 'HANH_VI' });
    expect(filters.difficulty).toEqual({ difficulty: 'Khó' });
    expect(filters.search).toEqual({
      text: { contains: 'quản lý', mode: 'insensitive' },
    });
  });

  test('chuỗi tìm kiếm rỗng KHÔNG thành bộ lọc', () => {
    expect(questionFilters({ q: '' }).search).toEqual({});
  });
});

describe('questionWhere', () => {
  test('luôn khoá status READY', () => {
    expect(questionWhere().status).toBe('READY');
  });

  test('gộp đủ cả bốn chiều', () => {
    expect(
      questionWhere({
        industry: 'IT_BACKEND',
        type: 'KIEN_THUC',
        difficulty: 'Dễ',
        q: 'api',
      }),
    ).toEqual({
      status: 'READY',
      industry: 'IT_BACKEND',
      type: 'KIEN_THUC',
      difficulty: 'Dễ',
      text: { contains: 'api', mode: 'insensitive' },
    });
  });
});

describe('decorate', () => {
  test('câu hành vi và động cơ KHÔNG được có đáp án mẫu', () => {
    for (const type of [...NO_SAMPLE_ANSWER]) {
      expect(decorate({ industry: null, type }).canHaveSampleAnswer).toBe(
        false,
      );
    }
  });

  test('câu kiến thức thì được', () => {
    expect(
      decorate({ industry: null, type: 'KIEN_THUC' }).canHaveSampleAnswer,
    ).toBe(true);
  });

  test('loại lạ vẫn cho phép đáp án mẫu, không vỡ', () => {
    const row = decorate({ industry: 'khong-co-that', type: 'LOAI_LA' });

    expect(row.canHaveSampleAnswer).toBe(true);
    expect(row.typeName).toBeNull();
    expect(row.industryName).toBeNull();
  });

  test('giữ nguyên mọi trường của hàng gốc', () => {
    const row = decorate({ id: 'q1', industry: null, type: null, text: 'Hỏi' });

    expect(row.id).toBe('q1');
    expect(row.text).toBe('Hỏi');
  });
});

describe('nhãn tiếng Việt', () => {
  test('mã null trả null chứ không vỡ', () => {
    expect(occupationName(null)).toBeNull();
    expect(typeLabel(null)).toBeNull();
  });

  test('dịch đủ bốn loại câu hỏi', () => {
    expect(typeLabel('KIEN_THUC')).toBe('Kiến thức');
    expect(typeLabel('QUY_TRINH')).toBe('Quy trình');
    expect(typeLabel('HANH_VI')).toBe('Hành vi');
    expect(typeLabel('DONG_CO')).toBe('Động cơ');
  });
});

describe('byCount', () => {
  test('xếp giảm dần và không sửa mảng gốc', () => {
    const rows = [{ count: 1 }, { count: 9 }, { count: 5 }];

    expect(byCount(rows).map((r) => r.count)).toEqual([9, 5, 1]);
    expect(rows.map((r) => r.count)).toEqual([1, 9, 5]);
  });
});
