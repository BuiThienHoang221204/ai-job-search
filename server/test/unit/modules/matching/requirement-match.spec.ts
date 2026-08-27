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

    /**
     * Cùng một thành phố viết sáu kiểu trong dữ liệu thật, và hồ sơ thì ghi kèm
     * quận. Phép so chuỗi cũ (`trim().toLowerCase()`) khớp 0/520 tin với 8
     * trong 12 hồ sơ có địa chỉ - kể cả người ở ngay trong thành phố đó.
     */
    test.each([
      ['Ho Chi Minh City', 'Quận Tân Bình, Hồ Chí Minh'],
      ['TP.HCM', 'Hồ Chí Minh'],
      ['Ho Chi Minh City Metropolitan Area', 'Bình Thạnh, TP. Hồ Chí Minh'],
      ['Hanoi', 'Cầu Giấy, Hà Nội'],
      ['Ha Noi', 'Hà Nội'],
    ])('tin ghi "%s", hồ sơ ghi "%s" → cùng tỉnh', (city, home) => {
      expect(
        matchRequirements(requirements({ city }), profile({ location: home }))
          .checks,
      ).toContainEqual(
        expect.objectContaining({ kind: 'LOCATION', met: true }),
      );
    });

    /** Bình Dương đã sáp nhập vào TP.HCM từ 1/7/2025 - so chuỗi không thấy. */
    test('tỉnh đã sáp nhập tính là cùng một nơi', () => {
      expect(
        matchRequirements(
          requirements({ city: 'Ho Chi Minh City' }),
          profile({ location: 'Thủ Dầu Một, Bình Dương' }),
        ).checks,
      ).toContainEqual(
        expect.objectContaining({ kind: 'LOCATION', met: true }),
      );
    });

    test('sẵn sàng chuyển chỗ vẫn NÓI RA là khác tỉnh', () => {
      const [check] = matchRequirements(
        requirements({ city: 'Cà Mau' }),
        profile({ location: 'Hà Nội', willingToRelocate: true }),
      ).checks.filter((row) => row.kind === 'LOCATION');

      expect({ met: check.met, coGhiChu: Boolean(check.note) }).toEqual({
        met: true,
        coGhiChu: true,
      });
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

describe('không khớp bừa theo chuỗi con', () => {
  /// Đo ngày 2026-08-24 trên bản cũ: một hồ sơ khai đúng kỹ năng "IT" khớp
  /// 4/4 yêu cầu của một tin marketing, tức 100%, và đứng đầu danh sách.
  test('hồ sơ khai "IT" KHÔNG khớp "Digital Marketing"', () => {
    const result = matchRequirements(
      requirements({
        requiredSkills: ['Digital Marketing', 'Quality Control', 'Security'],
      }),
      profile({ skills: ['IT'] }),
    );

    expect(result.met).toBe(0);
    expect(result.score).toBe(0);
  });

  test('"Excel" không khớp "technical excellence", "SAP" không khớp "Sapphire"', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['Technical excellence', 'Sapphire'] }),
      profile({ skills: ['Excel', 'SAP'] }),
    );

    expect(result.met).toBe(0);
  });

  test('ký hiệu vẫn khớp: ".NET" trong "ASP.NET Core"', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['.NET'] }),
      profile({ skills: ['ASP.NET Core'] }),
    );

    expect(result.score).toBe(100);
  });

  test('hồ sơ gõ không dấu vẫn khớp tin có dấu', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['Kế toán'] }),
      profile({ skills: ['Ke toan tong hop'] }),
    );

    expect(result.score).toBe(100);
  });
});

describe('mẫu số chỉ chứa yêu cầu về năng lực', () => {
  /// Địa điểm là điều kiện lọc, không phải thứ đáp ứng được "một phần". Tính
  /// nó vào mẫu số thì người ở tỉnh khác bị trừ thẳng vào tỉ lệ khớp kỹ năng.
  test('địa điểm không đạt KHÔNG kéo tỉ lệ khớp xuống', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['Kubernetes'], city: 'Hồ Chí Minh' }),
      profile({ location: 'Hà Nội' }),
    );

    expect(result.score).toBe(100);
    expect(result.total).toBe(1);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ kind: 'LOCATION', met: false }),
    );
  });

  test('dòng quốc tịch vẫn hiện ra nhưng không nằm trong mẫu số', () => {
    const result = matchRequirements(
      requirements({
        requiredSkills: ['Kubernetes'],
        citizenshipRequired: 'Việt Nam',
      }),
      profile({ citizenship: 'Việt Nam' }),
    );

    expect(result.total).toBe(1);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ kind: 'ELIGIBILITY' }),
    );
  });
});

describe('danh bạ kỹ năng', () => {
  /// `Y tá` và `Điều dưỡng` không chung một ký tự nào, nên không phép so chuỗi
  /// nào bắc cầu được. Đây là lý do danh bạ tồn tại.
  const dictionary = new Map([
    ['y ta', 'skill-nurse'],
    ['dieu duong', 'skill-nurse'],
    ['nurse', 'skill-nurse'],
    ['java', 'skill-java'],
    ['javascript', 'skill-javascript'],
  ]);

  test('cùng mã thì khớp dù chữ khác hẳn nhau', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['Y tá'] }),
      profile({ skills: ['Điều dưỡng'] }),
      dictionary,
    );

    expect(result.score).toBe(100);
  });

  test('dòng khớp qua danh bạ phải NÓI RÕ là khớp nhờ từ tương đương', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['Y tá'] }),
      profile({ skills: ['Điều dưỡng'] }),
      dictionary,
    );

    expect(result.checks).toContainEqual({
      label: 'Y tá',
      kind: 'SKILL',
      met: true,
      via: 'Điều dưỡng',
    });
  });

  test('khác mã thì KHÔNG khớp: Java không phải JavaScript', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['JavaScript'] }),
      profile({ skills: ['Java'] }),
      dictionary,
    );

    expect(result.met).toBe(0);
  });

  test('không truyền danh bạ thì hành vi y như cũ', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['Y tá'] }),
      profile({ skills: ['Điều dưỡng'] }),
    );

    expect(result.met).toBe(0);
  });

  test('chuỗi chưa có trong danh bạ không làm hỏng gì', () => {
    const result = matchRequirements(
      requirements({ requiredSkills: ['Hộ lý'] }),
      profile({ skills: ['Điều dưỡng'] }),
      dictionary,
    );

    expect(result.met).toBe(0);
  });
});
