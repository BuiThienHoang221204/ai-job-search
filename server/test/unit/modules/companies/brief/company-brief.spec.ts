import { z } from 'zod';
import { confidenceOf } from 'src/modules/companies/brief/brief-confidence.js';
import { companyBriefSchema } from 'src/modules/companies/brief/company-brief.schema.js';

const valid = {
  verdict: 'mixed',
  summary: 'Môi trường ổn cho người mới, lương tăng chậm.',
  pros: ['Đào tạo bài bản'],
  cons: ['Lương thấp'],
  rating: 3.7,
  reviewCount: 2187,
  usedSources: [{ index: 1, usedFor: 'Điểm trung bình' }],
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

  test('không nguồn nào dùng được vẫn hợp lệ - đó là ca thật', () => {
    expect(
      companyBriefSchema.parse({
        ...valid,
        verdict: 'no_reviews_yet',
        pros: [],
        cons: [],
        usedSources: [],
      }).verdict,
    ).toBe('no_reviews_yet');
  });

  test('URL do model bịa ra không lọt qua - nguồn khai bằng số thứ tự', () => {
    expect(() =>
      companyBriefSchema.parse({
        ...valid,
        usedSources: [{ url: 'https://bia-dat.com', usedFor: 'x' }],
      }),
    ).toThrow();
  });
});

/// Ngày 2026-08-24 một bản tóm tắt DÙNG ĐƯỢC bị vứt sạch vì `usedFor` dài 250
/// ký tự trên trần 160. Lỗi schema cố ý không đi tiếp chuỗi dự phòng, nên người
/// dùng mất trắng lượt chạy vì 90 ký tự thừa. Cắt bớt, đừng từ chối.
describe('companyBriefSchema chịu được model viết quá tay', () => {
  test('chuỗi quá dài bị CẮT, không làm hỏng cả lượt', () => {
    const parsed = companyBriefSchema.parse({
      ...valid,
      summary: 'a'.repeat(2_000),
      usedSources: [{ index: 1, usedFor: 'b'.repeat(600) }],
    });

    expect(parsed.summary).toHaveLength(700);
    expect(parsed.usedSources[0].usedFor).toHaveLength(240);
  });

  test('liệt kê thừa mục thì cắt bớt, và mục rỗng bị bỏ', () => {
    const parsed = companyBriefSchema.parse({
      ...valid,
      pros: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      cons: ['thật', '   ', ''],
    });

    expect(parsed.pros).toHaveLength(5);
    expect(parsed.cons).toEqual(['thật']);
  });

  test('điểm ngoài thang 5 thành null, không ném lỗi', () => {
    expect(
      companyBriefSchema.parse({ ...valid, rating: 8.5 }).rating,
    ).toBeNull();
    expect(
      companyBriefSchema.parse({ ...valid, rating: -1 }).rating,
    ).toBeNull();
    expect(
      companyBriefSchema.parse({ ...valid, reviewCount: -5 }).reviewCount,
    ).toBeNull();
  });

  test('nhãn kết luận lạ rơi về "unknown" thay vì giết cả bản tóm tắt', () => {
    const parsed = companyBriefSchema.parse({ ...valid, verdict: 'tuyệt vời' });

    expect(parsed.verdict).toBe('unknown');
    expect(parsed.summary).toBe(valid.summary);
  });

  test('số thứ tự nguồn vô lý không ném lỗi - resolveSources sẽ bỏ nó', () => {
    expect(
      companyBriefSchema.parse({
        ...valid,
        usedSources: [{ index: 0, usedFor: 'x' }],
      }).usedSources,
    ).toHaveLength(1);
  });

  /// `withSchemaInstruction` bơm JSON Schema vào system prompt và NUỐT lỗi nếu
  /// dựng hỏng. Không có `io: 'input'` thì transform làm nó ném, model mất sạch
  /// phần nhắc mà không có gì báo.
  test('vẫn dựng được JSON Schema để nhắc model', () => {
    const json = z.toJSONSchema(companyBriefSchema, { io: 'input' }) as {
      properties: Record<string, { description?: string }>;
    };

    expect(json.properties.summary.description).toContain('Tối đa 700 ký tự');
    expect(json.properties.pros.description).toContain('Điểm tốt');
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
