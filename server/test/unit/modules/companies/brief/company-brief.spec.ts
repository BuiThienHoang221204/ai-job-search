import { confidenceOf } from 'src/modules/companies/brief/brief-confidence.js';
import { companyBriefSchema } from 'src/modules/companies/brief/company-brief.schema.js';

const valid = {
  verdict: 'mixed',
  summary: 'Môi trường tốt cho người mới. Lương thấp hơn mặt bằng.',
  pros: ['Đào tạo bài bản'],
  cons: ['Lương tăng chậm'],
  rating: 3.7,
  reviewCount: 2187,
  usedSources: [{ index: 1, usedFor: 'Điểm trung bình và số lượt đánh giá' }],
};

describe('companyBriefSchema', () => {
  test('nhận bản tóm tắt đầy đủ', () => {
    expect(companyBriefSchema.parse(valid).rating).toBe(3.7);
  });

  test('cho phép không có con số nào, nhưng phải khai null chứ không vắng mặt', () => {
    expect(
      companyBriefSchema.parse({ ...valid, rating: null, reviewCount: null })
        .rating,
    ).toBeNull();

    const missing: Record<string, unknown> = { ...valid };
    delete missing.rating;
    expect(() => companyBriefSchema.parse(missing)).toThrow();
  });

  test('chặn điểm ngoài thang 5', () => {
    expect(() => companyBriefSchema.parse({ ...valid, rating: 8.5 })).toThrow();
    expect(() => companyBriefSchema.parse({ ...valid, rating: -1 })).toThrow();
  });

  test('chặn kết luận ngoài bốn nhãn cho phép', () => {
    expect(() =>
      companyBriefSchema.parse({ ...valid, verdict: 'tuyệt vời' }),
    ).toThrow();
  });

  test('nguồn khai bằng số thứ tự, URL do model bịa ra không lọt qua', () => {
    expect(() =>
      companyBriefSchema.parse({
        ...valid,
        usedSources: [{ index: 0, usedFor: 'x' }],
      }),
    ).toThrow();

    expect(() =>
      companyBriefSchema.parse({
        ...valid,
        usedSources: [{ url: 'https://bia-dat.com', usedFor: 'x' }],
      }),
    ).toThrow();
  });

  test('không nguồn nào dùng được vẫn hợp lệ - đó là ca thật', () => {
    expect(
      companyBriefSchema.parse({
        ...valid,
        verdict: 'unknown',
        pros: [],
        cons: [],
        usedSources: [],
      }).verdict,
    ).toBe('unknown');
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
