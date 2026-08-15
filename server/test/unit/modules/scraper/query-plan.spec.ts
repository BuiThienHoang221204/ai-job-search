import {
  MAX_QUERIES,
  planForSystem,
  planFromProfile,
  type QueryProfile,
} from 'src/modules/scraper/query-plan.js';

const profile = (overrides: Partial<QueryProfile> = {}): QueryProfile => ({
  headline: null,
  location: null,
  primarySkills: [],
  targetSectors: [],
  ...overrides,
});

/**
 * Hồ sơ kế toán: kỹ năng chính KHÔNG dùng làm từ khoá tìm việc được. Đây là
 * trường hợp mà bản đầu tiên của scraper làm sai, nên nó xuất hiện xuyên suốt
 * file này.
 */
const ketToan = profile({
  headline: 'Kế toán tổng hợp',
  location: 'Ha Noi',
  primarySkills: ['Excel', 'Misa', 'Báo cáo thuế', 'Giao tiếp'],
  targetSectors: ['Ngân hàng', 'Sản xuất'],
});

const lapTrinh = profile({
  headline: 'Senior React Developer',
  location: 'Ho Chi Minh',
  primarySkills: ['React', 'NestJS', 'TypeScript'],
  targetSectors: ['Fintech'],
});

describe('planFromProfile', () => {
  it('đặt chức danh lên đầu, không phải kỹ năng', () => {
    expect(planFromProfile(ketToan)[0].query).toBe('Kế toán tổng hợp');
    expect(planFromProfile(lapTrinh)[0].query).toBe('Senior React Developer');
  });

  it('ghép chức danh với lĩnh vực mục tiêu thay vì để lĩnh vực đứng riêng', () => {
    const queries = planFromProfile(ketToan).map((q) => q.query);

    expect(queries).toContain('Kế toán tổng hợp Ngân hàng');
    // Lĩnh vực đứng một mình trả về mọi vị trí trong ngành, từ giao dịch viên
    // tới bảo vệ - đó là lý do có hàm này.
    expect(queries).not.toContain('Ngân hàng');
    expect(queries).not.toContain('Sản xuất');
  });

  it('xếp kỹ năng sau chức danh và lĩnh vực', () => {
    const queries = planFromProfile(ketToan).map((q) => q.query);
    const viTriKyNang = queries.indexOf('Excel');
    const viTriLinhVuc = queries.indexOf('Kế toán tổng hợp Ngân hàng');

    expect(viTriKyNang).toBeGreaterThan(viTriLinhVuc);
  });

  it('không sinh truy vấn nào khi hồ sơ trống', () => {
    // Trước đây chỗ này lùi về 'developer'. Với một trợ lý tìm việc đa ngành
    // thì đó là câu trả lời sai cho mọi người trừ dân IT.
    expect(planFromProfile(profile())).toEqual([]);
    expect(planFromProfile(null)).toEqual([]);
  });

  it('không lấy lĩnh vực làm truy vấn khi hồ sơ thiếu chức danh', () => {
    const queries = planFromProfile(
      profile({ targetSectors: ['Ngân hàng'], primarySkills: ['Excel'] }),
    ).map((q) => q.query);

    expect(queries).toEqual(['Excel']);
  });

  it('gắn địa điểm của hồ sơ vào mọi truy vấn', () => {
    for (const query of planFromProfile(ketToan)) {
      expect(query.location).toBe('Ha Noi');
    }
  });

  it('tôn trọng trần số truy vấn', () => {
    const nhieu = profile({
      headline: 'Chuyên viên tuyển dụng',
      targetSectors: ['Ngân hàng', 'Bán lẻ', 'Sản xuất', 'Logistics'],
      primarySkills: ['Sourcing', 'Phỏng vấn', 'Onboarding', 'Employer brand'],
    });

    expect(planFromProfile(nhieu)).toHaveLength(MAX_QUERIES);
  });

  it('bỏ trùng lặp không phân biệt hoa thường', () => {
    const queries = planFromProfile(
      profile({ headline: 'Kế toán', primarySkills: ['kế toán', 'Excel'] }),
    ).map((q) => q.query);

    expect(queries).toEqual(['Kế toán', 'Excel']);
  });

  it('bỏ phần trong ngoặc của chức danh', () => {
    const queries = planFromProfile(
      profile({ headline: 'Kế toán tổng hợp (part-time)' }),
    );

    expect(queries[0].query).toBe('Kế toán tổng hợp');
  });

  it('bỏ qua mục rỗng và mục quá ngắn', () => {
    const queries = planFromProfile(
      profile({ primarySkills: ['  ', 'A', 'Excel'] }),
    ).map((q) => q.query);

    expect(queries).toEqual(['Excel']);
  });
});

describe('planForSystem', () => {
  it('xếp chức danh trước kỹ năng', () => {
    const queries = planForSystem(
      [
        { headline: 'Kế toán tổng hợp', primarySkills: ['Excel'] },
        { headline: 'Kế toán tổng hợp', primarySkills: ['Excel'] },
        { headline: 'Nhân viên kinh doanh', primarySkills: ['Excel'] },
      ],
      6,
    ).map((q) => q.query);

    // 'Excel' được 3 hồ sơ khai, nhiều hơn mọi chức danh, nhưng vẫn phải xếp
    // sau: chức danh mới là thứ nhà tuyển dụng dùng để đặt tên tin.
    expect(queries.indexOf('Excel')).toBeGreaterThan(
      queries.indexOf('Nhân viên kinh doanh'),
    );
  });

  it('trong cùng một nhóm thì cái nhiều hồ sơ khai được xếp trước', () => {
    const queries = planForSystem(
      [
        { headline: 'Kế toán tổng hợp', primarySkills: [] },
        { headline: 'Kế toán tổng hợp', primarySkills: [] },
        { headline: 'Nhân viên kinh doanh', primarySkills: [] },
      ],
      6,
    );

    expect(queries[0].query).toBe('Kế toán tổng hợp');
    expect(queries[0].rationale).toContain('2');
  });

  it('không sinh truy vấn nào khi chưa có hồ sơ nào đủ dữ liệu', () => {
    expect(planForSystem([], 6)).toEqual([]);
    expect(planForSystem([{ headline: null, primarySkills: [] }], 6)).toEqual(
      [],
    );
  });

  it('chỉ lấy 4 kỹ năng đầu của mỗi hồ sơ', () => {
    const queries = planForSystem(
      [
        {
          headline: null,
          primarySkills: ['A1', 'B1', 'C1', 'D1', 'KhongDuocLay'],
        },
      ],
      6,
    ).map((q) => q.query);

    expect(queries).not.toContain('KhongDuocLay');
  });

  it('tôn trọng giới hạn truyền vào', () => {
    const profiles = Array.from({ length: 10 }, (_, index) => ({
      headline: `Chức danh ${index}`,
      primarySkills: [`Kỹ năng ${index}`],
    }));

    expect(planForSystem(profiles, 3)).toHaveLength(3);
  });

  it('không lặp lại một từ khoá đã xuất hiện ở nhóm chức danh', () => {
    const queries = planForSystem(
      [{ headline: 'Kế toán', primarySkills: ['kế toán', 'Excel'] }],
      6,
    ).map((q) => q.query);

    expect(queries).toEqual(['Kế toán', 'Excel']);
  });
});
