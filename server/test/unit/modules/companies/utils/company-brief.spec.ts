import { z } from 'zod';
import {
  briefViewOf,
  companyBriefSchema,
  FORCE_COOLDOWN_MS,
  forceTooSoon,
  type PublicBriefRow,
} from 'src/modules/companies/utils/company-brief.js';

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

describe('briefViewOf', () => {
  const NOW = Date.parse('2026-10-16T10:00:00Z');
  const row = (expiresAt: Date): PublicBriefRow => ({
    verdict: 'MIXED',
    summary: 'Ổn.',
    pros: [],
    cons: [],
    confidence: 'LOW',
    rating: null,
    reviewCount: null,
    sources: [],
    expiresAt,
    updatedAt: new Date(NOW - 1_000),
  });

  test('chưa có bản nào thì brief null, không cũ', () => {
    expect(briefViewOf('A', null, NOW)).toEqual({
      company: 'A',
      researchable: true,
      brief: null,
      stale: false,
    });
  });

  test('hạn dùng chỉ để suy ra "cũ", không trả ra ngoài', () => {
    const view = briefViewOf('A', row(new Date(NOW - 1)), NOW);

    expect(view.stale).toBe(true);
    expect(view.brief).not.toHaveProperty('expiresAt');
    expect(briefViewOf('A', row(new Date(NOW + 1)), NOW).stale).toBe(false);
  });
});

describe('forceTooSoon', () => {
  const NOW = Date.parse('2026-10-16T10:00:00Z');

  test('trong cửa sổ chặn thì quá sớm', () => {
    expect(forceTooSoon(new Date(NOW - FORCE_COOLDOWN_MS + 1), NOW)).toBe(true);
  });

  test('qua cửa sổ thì làm mới được', () => {
    expect(forceTooSoon(new Date(NOW - FORCE_COOLDOWN_MS), NOW)).toBe(false);
  });
});
