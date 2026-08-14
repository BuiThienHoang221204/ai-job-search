import {
  WEIGHTS,
  computeOverall,
  evaluationSchema,
  verdictFor,
  type Evaluation,
} from './evaluation.schema.js';

/// Kết quả hợp lệ tối thiểu, dùng làm nền rồi ghi đè từng trường.
const base = (scores: {
  technical: number;
  experience: number;
  behavioral: number;
  career: number;
}): Evaluation => ({
  eligibility: {
    verdict: 'PASS',
    quote: '',
    note: 'Công dân Việt Nam, vị trí tại Việt Nam.',
  },
  technical: { score: scores.technical, note: 'Khớp kỹ năng chính.' },
  experience: { score: scores.experience, note: 'Đủ số năm kinh nghiệm.' },
  behavioral: { score: scores.behavioral, note: 'Từng dẫn dắt nhóm.' },
  career: { score: scores.career, note: 'Đúng định hướng.' },
  location: { pass: true, note: 'Cùng thành phố.' },
  strengths: ['Thành thạo React và Next.js.'],
  gaps: [],
  recommendation: 'Nên ứng tuyển.',
});

describe('WEIGHTS', () => {
  test('tổng trọng số bằng 1', () => {
    const total =
      WEIGHTS.technical +
      WEIGHTS.experience +
      WEIGHTS.behavioral +
      WEIGHTS.career;
    expect(total).toBeCloseTo(1, 10);
  });

  test('khớp đúng mục Weighting trong 04-job-evaluation.md', () => {
    expect(WEIGHTS).toEqual({
      technical: 0.3,
      experience: 0.25,
      behavioral: 0.15,
      career: 0.3,
    });
  });
});

describe('computeOverall', () => {
  test('tính đúng trung bình có trọng số', () => {
    // 90*.30 + 80*.25 + 70*.15 + 60*.30 = 27 + 20 + 10.5 + 18 = 75.5 -> 76
    expect(
      computeOverall(
        base({ technical: 90, experience: 80, behavioral: 70, career: 60 }),
      ),
    ).toBe(76);
  });

  test('toàn điểm tối đa cho 100', () => {
    expect(
      computeOverall(
        base({ technical: 100, experience: 100, behavioral: 100, career: 100 }),
      ),
    ).toBe(100);
  });

  test('toàn điểm 0 cho 0', () => {
    expect(
      computeOverall(
        base({ technical: 0, experience: 0, behavioral: 0, career: 0 }),
      ),
    ).toBe(0);
  });

  test('chiều kỹ thuật nặng hơn chiều hành vi', () => {
    // Cùng một mức điểm, đặt vào chiều 30% phải cho tổng cao hơn chiều 15%.
    const nangKyThuat = computeOverall(
      base({ technical: 100, experience: 50, behavioral: 50, career: 50 }),
    );
    const nangHanhVi = computeOverall(
      base({ technical: 50, experience: 50, behavioral: 100, career: 50 }),
    );
    expect(nangKyThuat).toBeGreaterThan(nangHanhVi);
  });
});

describe('verdictFor', () => {
  // Ngưỡng lấy từ mục Thresholds: 75+ / 60-74 / 45-59 / 30-44 / dưới 30.
  test.each([
    [100, 'STRONG'],
    [75, 'STRONG'],
    [74, 'GOOD'],
    [60, 'GOOD'],
    [59, 'MODERATE'],
    [45, 'MODERATE'],
    [44, 'WEAK'],
    [30, 'WEAK'],
    [29, 'POOR'],
    [0, 'POOR'],
  ])('%i điểm -> %s', (score, expected) => {
    expect(verdictFor(score)).toBe(expected);
  });
});

describe('evaluationSchema', () => {
  test('chấp nhận kết quả hợp lệ', () => {
    const parsed = evaluationSchema.safeParse(
      base({ technical: 87, experience: 88, behavioral: 80, career: 82 }),
    );
    expect(parsed.success).toBe(true);
  });

  test('từ chối điểm vượt 100', () => {
    const parsed = evaluationSchema.safeParse(
      base({ technical: 101, experience: 80, behavioral: 80, career: 80 }),
    );
    expect(parsed.success).toBe(false);
  });

  test('từ chối điểm âm', () => {
    const parsed = evaluationSchema.safeParse(
      base({ technical: -1, experience: 80, behavioral: 80, career: 80 }),
    );
    expect(parsed.success).toBe(false);
  });

  test('từ chối điểm thập phân', () => {
    const parsed = evaluationSchema.safeParse(
      base({ technical: 87.5, experience: 80, behavioral: 80, career: 80 }),
    );
    expect(parsed.success).toBe(false);
  });

  test('bắt buộc có ít nhất một thế mạnh', () => {
    const invalid = {
      ...base({ technical: 80, experience: 80, behavioral: 80, career: 80 }),
      strengths: [],
    };
    expect(evaluationSchema.safeParse(invalid).success).toBe(false);
  });

  test('quote có thể để trống khi tin không nói gì về quyền làm việc', () => {
    const value = base({
      technical: 80,
      experience: 80,
      behavioral: 80,
      career: 80,
    });
    const withoutQuote = {
      ...value,
      eligibility: { verdict: 'UNVERIFIED' as const, note: 'Tin im lặng.' },
    };
    const parsed = evaluationSchema.safeParse(withoutQuote);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.eligibility.quote).toBe('');
  });

  test('chỉ chấp nhận ba giá trị eligibility', () => {
    const value = base({
      technical: 80,
      experience: 80,
      behavioral: 80,
      career: 80,
    });
    const invalid = {
      ...value,
      eligibility: { ...value.eligibility, verdict: 'MAYBE' },
    };
    expect(evaluationSchema.safeParse(invalid).success).toBe(false);
  });
});
