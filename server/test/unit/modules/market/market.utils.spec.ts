import {
  marketSections,
  marketSlugOf,
  median,
  salaryOf,
} from 'src/modules/market/market.utils.js';

describe('market.utils', () => {
  test('slug là tên ngành không dấu nối gạch', () => {
    expect(marketSlugOf('Kế toán / Kiểm toán / Tài chính')).toBe(
      'ke-toan-kiem-toan-tai-chinh',
    );
  });

  test('lương đại diện lấy giữa khoảng, hoặc mức duy nhất portal ghi', () => {
    expect(salaryOf({ salaryMin: 10, salaryMax: 20 })).toBe(15);
    expect(salaryOf({ salaryMin: null, salaryMax: 20 })).toBe(20);
    expect(salaryOf({ salaryMin: null, salaryMax: null })).toBeNull();
    expect(median([30, 10, 20, 40])).toBe(25);
  });

  test('kỹ năng tính % trên tin đã rút yêu cầu, mỗi tin đếm một lần, viết hoa chữ đầu; cấp bậc bỏ UNKNOWN', () => {
    const job = {
      subOccupationCode: null,
      provinceCode: null,
      salaryMin: null,
      salaryMax: null,
    };
    const sections = marketSections(
      [
        { ...job, skillKeys: ['java', 'java', 'sql'], seniority: 'JUNIOR' },
        { ...job, skillKeys: ['java'], seniority: 'UNKNOWN' },
        { ...job, skillKeys: null, seniority: null },
      ],
      new Map([['java', 'Java']]),
    );

    expect(sections.skills).toEqual({
      analysed: 2,
      top: [
        { name: 'Java', percent: 100 },
        { name: 'Sql', percent: 50 },
      ],
    });
    expect(sections.seniority[0]).toEqual({
      label: 'Thực tập – Junior',
      percent: 100,
    });
  });
});
