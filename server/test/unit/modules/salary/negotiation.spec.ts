import type { ReferencePosition } from 'src/modules/salary/job-position.js';
import {
  labelForYears,
  negotiationRange,
  requiredYearsOf,
  type NegotiationInput,
} from 'src/modules/salary/negotiation.js';

const accountant: ReferencePosition = {
  positionSlug: 'accounting-auditing-finance-general-accountant',
  positionName: 'Kế toán tổng hợp',
  occupationCode: 'FINANCE',
  avgMonthly: 17_000_000,
  rangeMin: 10_000_000,
  rangeMax: 28_000_000,
  currency: 'VND',
  bands: [
    {
      experienceLabel: '1–3 năm',
      minAmount: 15_000_000,
      avgAmount: 16_000_000,
      maxAmount: 17_000_000,
    },
    {
      experienceLabel: '3–5 năm',
      minAmount: 16_000_000,
      avgAmount: 18_000_000,
      maxAmount: 20_000_000,
    },
  ],
};

const backend: ReferencePosition = {
  positionSlug: 'it-software-backend-developer',
  positionName: 'Lập trình viên Backend',
  occupationCode: 'IT',
  avgMonthly: 27_000_000,
  rangeMin: 12_000_000,
  rangeMax: 45_000_000,
  currency: 'VND',
  bands: [
    {
      experienceLabel: '1–3 năm',
      minAmount: 18_000_000,
      avgAmount: 22_000_000,
      maxAmount: 26_000_000,
    },
    {
      experienceLabel: 'Trên 5 năm',
      minAmount: 45_000_000,
      avgAmount: 51_000_000,
      maxAmount: 57_000_000,
    },
  ],
};

const fullstack: ReferencePosition = {
  positionSlug: 'it-software-fullstack-developer',
  positionName: 'Lập trình viên Fullstack',
  occupationCode: 'IT',
  avgMonthly: 26_000_000,
  rangeMin: 12_000_000,
  rangeMax: 50_000_000,
  currency: 'VND',
  bands: [
    {
      experienceLabel: '1–3 năm',
      minAmount: 15_000_000,
      avgAmount: 20_000_000,
      maxAmount: 25_000_000,
    },
    {
      experienceLabel: 'Trên 5 năm',
      minAmount: 37_000_000,
      avgAmount: 43_000_000,
      maxAmount: 50_000_000,
    },
  ],
};

const nodejs: ReferencePosition = {
  ...backend,
  positionSlug: 'it-software-nodejs-developer',
  positionName: 'Lập trình viên Node.js',
  avgMonthly: 22_000_000,
  bands: [
    {
      experienceLabel: '1–3 năm',
      minAmount: 16_000_000,
      avgAmount: 20_000_000,
      maxAmount: 24_000_000,
    },
  ],
};

const input = (over: Partial<NegotiationInput> = {}): NegotiationInput => ({
  resolved: {
    basis: 'POSITION',
    label: 'Kế toán tổng hợp',
    positions: [accountant],
  },
  candidateYears: 2,
  minYears: 2,
  seniority: 'UNKNOWN',
  fitScore: 50,
  ...over,
});

describe('labelForYears', () => {
  test('chia bốn mốc theo số năm', () => {
    expect(labelForYears(0)).toBe('Dưới 1 năm');
    expect(labelForYears(1.8)).toBe('1–3 năm');
    expect(labelForYears(4)).toBe('3–5 năm');
    expect(labelForYears(8)).toBe('Trên 5 năm');
  });

  test('không biết số năm thì trả null', () => {
    expect(labelForYears(null)).toBeNull();
  });
});

describe('requiredYearsOf', () => {
  test('tin nêu số năm thì lấy đúng số đó', () => {
    expect(requiredYearsOf(3, 'SENIOR')).toBe(3);
  });

  test('tin không nêu thì suy từ cấp bậc', () => {
    expect(requiredYearsOf(null, 'FRESHER')).toBe(0);
    expect(requiredYearsOf(null, 'SENIOR')).toBe(5);
  });

  test('không có căn cứ nào thì trả null', () => {
    expect(requiredYearsOf(null, 'UNKNOWN')).toBeNull();
  });
});

describe('negotiationRange', () => {
  test('hồ sơ trung tính thì mục tiêu bám mức trung bình của mốc', () => {
    const range = negotiationRange(input());
    expect(range?.experienceLabel).toBe('1–3 năm');
    expect(range?.target).toBe(16_000_000);
    expect(range?.floor).toBe(15_000_000);
    expect(range?.ceiling).toBe(17_000_000);
  });

  test('hồ sơ mạnh nới trần nhưng không nhảy tới trần cả vị trí', () => {
    const range = negotiationRange(input({ fitScore: 100 }));
    expect(range?.ceiling).toBe(19_500_000);
    expect(range?.target).toBeGreaterThan(16_000_000);
  });

  test('hồ sơ yếu hạ sàn nhưng không rơi xuống sàn cả vị trí', () => {
    const range = negotiationRange(input({ fitScore: 10 }));
    expect(range?.floor).toBe(13_000_000);
    expect(range?.target).toBeLessThan(16_000_000);
  });

  test('sàn không tụt quá một bậc khi điểm phù hợp giảm', () => {
    const neutral = negotiationRange(input({ fitScore: 50 }))!;
    const weak = negotiationRange(input({ fitScore: 20 }))!;
    expect(weak.floor).toBeGreaterThan(neutral.floor * 0.8);
  });

  test('thiếu mốc kinh nghiệm thì khoảng không được phình ra cả dải nghề', () => {
    const range = negotiationRange(
      input({
        resolved: {
          basis: 'SUB_OCCUPATION',
          label: 'Backend, Node.js',
          positions: [backend, nodejs],
        },
        candidateYears: null,
        minYears: null,
        seniority: 'UNKNOWN',
      }),
    )!;
    expect(range.ceiling - range.floor).toBeLessThan(range.target);
  });

  test('mục tiêu luôn nằm trong khoảng sàn - trần', () => {
    for (const fitScore of [0, 25, 50, 75, 100]) {
      const range = negotiationRange(input({ fitScore }));
      expect(range!.target).toBeGreaterThanOrEqual(range!.floor);
      expect(range!.target).toBeLessThanOrEqual(range!.ceiling);
    }
  });

  test('thiếu điểm phù hợp thì coi như trung tính, không phải bằng 0', () => {
    expect(negotiationRange(input({ fitScore: null }))?.target).toBe(
      negotiationRange(input({ fitScore: 50 }))?.target,
    );
  });

  test('tầng nhóm lấy trung vị của các vị trí trong nhóm', () => {
    const range = negotiationRange(
      input({
        resolved: {
          basis: 'SUB_OCCUPATION',
          label: 'Lập trình viên Backend, Lập trình viên Node.js',
          positions: [backend, nodejs],
        },
        minYears: 2,
      }),
    );
    expect(range?.positionCount).toBe(2);
    expect(range?.target).toBe(21_000_000);
  });

  test('không biết số năm của ai thì rơi về số của cả vị trí', () => {
    const range = negotiationRange(
      input({ candidateYears: null, minYears: null, seniority: 'UNKNOWN' }),
    );
    expect(range?.experienceLabel).toBeNull();
    expect(range?.experienceSource).toBeNull();
    expect(range?.target).toBe(17_000_000);
  });

  test('lương hiện tại nâng sàn lên, và được đánh dấu', () => {
    const range = negotiationRange(input({ currentSalary: 20_000_000 }));
    expect(range?.anchoredOnCurrentSalary).toBe(true);
    expect(range?.floor).toBe(22_000_000);
    expect(range?.ceiling).toBeGreaterThanOrEqual(range!.floor);
  });

  test('lương hiện tại thấp hơn mặt bằng thì không kéo sàn xuống', () => {
    const range = negotiationRange(input({ currentSalary: 8_000_000 }));
    expect(range?.anchoredOnCurrentSalary).toBe(false);
    expect(range?.floor).toBe(15_000_000);
  });

  test('lương tin đăng thấp hơn thì ép trần xuống', () => {
    const range = negotiationRange(input({ postedMax: 16_000_000 }));
    expect(range?.cappedByPosting).toBe(true);
    expect(range?.ceiling).toBe(16_000_000);
    expect(range?.target).toBeLessThanOrEqual(16_000_000);
  });

  test('kỳ vọng ngoài khoảng được gắn cờ chứ không bị sửa', () => {
    const above = negotiationRange(input({ expectedSalary: 40_000_000 }));
    expect(above?.expectedAboveCeiling).toBe(true);
    expect(above?.expectedSalary).toBe(40_000_000);
    expect(above?.ceiling).toBe(17_000_000);

    const below = negotiationRange(input({ expectedSalary: 9_000_000 }));
    expect(below?.expectedBelowFloor).toBe(true);
  });

  test('người 1,8 năm KHÔNG được đề xuất mức của tin đòi trên 5 năm', () => {
    const range = negotiationRange(
      input({
        resolved: {
          basis: 'SUB_OCCUPATION',
          label: 'Lập trình viên Fullstack, Lập trình viên Backend',
          positions: [fullstack, backend],
        },
        candidateYears: 1.8,
        minYears: 5,
        seniority: 'SENIOR',
        fitScore: 68,
        currentSalary: 14_000_000,
        expectedSalary: 18_000_000,
      }),
    )!;

    expect(range.experienceLabel).toBe('1–3 năm');
    expect(range.experienceSource).toBe('PROFILE');
    expect(range.experienceGap).toBe(true);
    expect(range.requiredYears).toBe(5);
    expect(range.ceiling).toBeLessThan(37_000_000);
    expect(range.expectedBelowFloor).toBe(false);
  });

  test('kinh nghiệm nhiều hơn tin đòi thì vẫn tính theo hồ sơ, không bị ép xuống', () => {
    const range = negotiationRange(
      input({
        resolved: {
          basis: 'POSITION',
          label: 'Lập trình viên Backend',
          positions: [backend],
        },
        candidateYears: 7,
        minYears: 1,
        seniority: 'JUNIOR',
      }),
    )!;

    expect(range.experienceLabel).toBe('Trên 5 năm');
    expect(range.experienceGap).toBe(false);
    expect(range.target).toBeGreaterThan(40_000_000);
  });

  test('hồ sơ chưa đọc được số năm thì mới mượn mốc của tin, và nói rõ', () => {
    const range = negotiationRange(
      input({ candidateYears: null, minYears: 4, seniority: 'UNKNOWN' }),
    )!;

    expect(range.experienceLabel).toBe('3–5 năm');
    expect(range.experienceSource).toBe('POSTING');
    expect(range.experienceGap).toBe(false);
  });

  test('không có vị trí nào thì trả null', () => {
    expect(
      negotiationRange(
        input({
          resolved: { basis: 'POSITION', label: '', positions: [] },
        }),
      ),
    ).toBeNull();
  });

  test('vị trí không có số nào thì trả null chứ không bịa', () => {
    const empty: ReferencePosition = {
      ...accountant,
      avgMonthly: null,
      rangeMin: null,
      rangeMax: null,
      bands: [],
    };
    expect(
      negotiationRange(
        input({
          resolved: { basis: 'POSITION', label: 'Trống', positions: [empty] },
        }),
      ),
    ).toBeNull();
  });
});
