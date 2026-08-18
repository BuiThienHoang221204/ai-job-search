import type { JobRequirements } from 'src/modules/matching/schemas/job-requirements.schema.js';
import {
  matchRequirements,
  type MatchProfile,
} from 'src/modules/matching/requirement-match.js';

const requirements = (
  overrides: Partial<JobRequirements> = {},
): JobRequirements => ({
  requiredSkills: ['Kubernetes', 'Terraform'],
  niceToHaveSkills: [],
  minYears: null,
  seniority: 'MIDDLE',
  citizenshipRequired: null,
  workPermitRequired: false,
  eligibilityQuote: '',
  city: null,
  remotePolicy: 'UNKNOWN',
  ...overrides,
});

const profile = (overrides: Partial<MatchProfile> = {}): MatchProfile => ({
  skills: ['Kubernetes', 'Terraform', 'Docker'],
  citizenship: 'Việt Nam',
  workPermit: null,
  location: 'Hà Nội',
  willingToRelocate: false,
  years: null,
  ...overrides,
});

describe('matchRequirements', () => {
  test('đáp ứng hết kỹ năng bắt buộc thì 100 điểm', () => {
    const result = matchRequirements(requirements(), profile());

    expect(result.score).toBe(100);
    expect(result.met).toBe(2);
    expect(result.total).toBe(2);
  });

  test('thiếu một kỹ năng thì điểm giảm và dòng đó ghi rõ', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['Kubernetes', 'AWS'] }),
      profile(),
    );

    expect(result.score).toBe(50);
    expect(result.checks).toContainEqual({
      label: 'AWS',
      kind: 'SKILL',
      met: false,
    });
  });

  test('khớp hai chiều: yêu cầu "AWS" khớp hồ sơ ghi "AWS Lambda"', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['AWS'] }),
      profile({ skills: ['AWS Lambda'] }),
    );

    expect(result.score).toBe(100);
  });

  test('kỹ năng ưu tiên đáng nửa điểm so với bắt buộc', () => {
    // 1 bắt buộc đạt (1.0) + 1 ưu tiên trượt (0.5) -> 1.0 / 1.5 = 67%
    const result = matchRequirements(
      requirements({
        requiredSkills: ['Kubernetes'],
        niceToHaveSkills: ['Rust'],
      }),
      profile(),
    );

    expect(result.score).toBe(67);
  });

  test('hồ sơ chưa khai số năm thì KHÔNG tính vào mẫu số', () => {
    // Đoán bừa "chưa khai = không đạt" sẽ trừ điểm oan mọi hồ sơ chưa đầy đủ.
    const result = matchRequirements(
      requirements({ minYears: 5 }),
      profile({ years: null }),
    );

    expect(result.score).toBe(100);
    expect(result.total).toBe(2);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ kind: 'YEARS', met: null }),
    );
  });

  test('đủ số năm thì đạt, thiếu thì trượt', () => {
    expect(
      matchRequirements(requirements({ minYears: 3 }), profile({ years: 5 }))
        .score,
    ).toBe(100);

    expect(
      matchRequirements(requirements({ minYears: 5 }), profile({ years: 3 }))
        .score,
    ).toBe(67);
  });

  describe('cổng tư cách', () => {
    test('tin không nhắc quốc tịch thì PASS', () => {
      expect(matchRequirements(requirements(), profile()).eligibility).toBe(
        'PASS',
      );
    });

    test('tin đòi quốc tịch khác thì FAIL và điểm về 0', () => {
      const result = matchRequirements(
        requirements({ citizenshipRequired: 'Nhật Bản' }),
        profile({ citizenship: 'Việt Nam' }),
      );

      expect(result.eligibility).toBe('FAIL');
      expect(result.score).toBe(0);
    });

    test('hồ sơ chưa khai quốc tịch thì UNVERIFIED, KHÔNG phải FAIL', () => {
      // Đoán sai ở đây loại thẳng ứng viên khỏi một tin họ đủ điều kiện.
      const result = matchRequirements(
        requirements({ citizenshipRequired: 'Việt Nam' }),
        profile({ citizenship: null }),
      );

      expect(result.eligibility).toBe('UNVERIFIED');
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('địa điểm', () => {
    test('tin remote thì luôn đạt', () => {
      const result = matchRequirements(
        requirements({ remotePolicy: 'REMOTE' }),
        profile({ location: 'Cà Mau' }),
      );

      expect(result.checks).toContainEqual(
        expect.objectContaining({ kind: 'LOCATION', met: true }),
      );
    });

    test('khác thành phố thì trượt, trừ khi sẵn sàng chuyển', () => {
      const onsite = requirements({ city: 'Hồ Chí Minh' });

      expect(matchRequirements(onsite, profile()).checks).toContainEqual(
        expect.objectContaining({ kind: 'LOCATION', met: false }),
      );
      expect(
        matchRequirements(onsite, profile({ willingToRelocate: true })).checks,
      ).toContainEqual(
        expect.objectContaining({ kind: 'LOCATION', met: true }),
      );
    });

    test('không đủ dữ liệu địa điểm thì bỏ qua dòng đó', () => {
      const result = matchRequirements(
        requirements({ city: 'Hồ Chí Minh' }),
        profile({ location: null }),
      );

      expect(result.checks.some((check) => check.kind === 'LOCATION')).toBe(
        false,
      );
    });
  });
});

describe('chức danh tham gia đối chiếu', () => {
  /// Hồ sơ kế toán khai Excel/Misa nhưng không khai "kế toán" thành kỹ năng.
  /// Bỏ chức danh ra ngoài thì mọi tin kế toán đều khớp 0.
  test('yêu cầu "kế toán" khớp chức danh "Kế toán tổng hợp"', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['kế toán'] }),
      profile({ skills: ['Kế toán tổng hợp', 'Excel', 'Misa'] }),
    );

    expect(result.score).toBe(100);
  });
});
