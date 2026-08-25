import { jobTitleOf } from 'src/modules/profile/headline.js';
import { profileOccupation } from 'src/modules/profile/occupation.js';

/**
 * Chín hồ sơ demo thật trong `scripts/demo-personas.mjs`. Chúng là đầu vào của
 * việc gom truy vấn theo ngành, nên phân loại sai ở đây nghĩa là cả một ngành
 * không được quét mà không có lỗi nào báo ra.
 */
const personas: Array<[string, string[], string]> = [
  ['Backend Developer', ['Node.js', 'TypeScript'], 'IT'],
  ['Lập trình viên Full Stack', ['ReactJS', 'NextJS'], 'IT'],
  ['Kế toán tổng hợp', ['MISA', 'Excel', 'Báo cáo thuế'], 'FINANCE'],
  ['Điều dưỡng viên', ['Điều dưỡng', 'Hồi sức cấp cứu'], 'HEALTHCARE'],
  ['English Teacher', ['IELTS', 'TESOL'], 'EDUCATION'],
  ['Nhân viên kinh doanh B2B', ['Bán hàng B2B', 'Đàm phán'], 'SALES'],
  ['Nhân viên xuất nhập khẩu', ['Khai báo hải quan', 'ECUS'], 'LOGISTICS'],
  ['Kỹ sư cơ khí', ['SolidWorks', 'AutoCAD'], 'MANUFACTURING'],
  ['Sinh viên mới tốt nghiệp ngành Marketing', ['Facebook Ads'], 'MARKETING'],
];

describe('profileOccupation', () => {
  test.each(personas)('%s -> %s', (headline, primarySkills, expected) => {
    expect(profileOccupation({ headline, primarySkills })).toBe(expected);
  });

  test('hồ sơ trống trả null chứ không phải OTHER', () => {
    // Gán OTHER thì mọi người chưa điền hồ sơ gộp thành một cụm, và cụm rỗng đó
    // chiếm mất một suất truy vấn của một ngành có thật.
    expect(profileOccupation({ headline: null, primarySkills: [] })).toBeNull();
    expect(
      profileOccupation({ headline: '  ', primarySkills: ['  '] }),
    ).toBeNull();
  });

  test('chỉ có kỹ năng, chưa có chức danh thì vẫn suy được', () => {
    expect(
      profileOccupation({ headline: null, primarySkills: ['Điều dưỡng'] }),
    ).toBe('HEALTHCARE');
  });

  test('không khớp danh mục nào thì rơi vào OTHER', () => {
    expect(
      profileOccupation({
        headline: 'Nghệ nhân gốm Bát Tràng',
        primarySkills: [],
      }),
    ).toBe('OTHER');
  });
});

/**
 * Backfill thật ngày 19/8/2026 xếp `cokhi@` vào IT thay vì MANUFACTURING: chữ
 * "engineer" ở đoạn SAU dấu gạch đứng khớp từ khoá của nhóm công nghệ thông
 * tin, mà nhóm đó đứng trước trong danh mục. Không có lỗi nào được ném ra —
 * chỉ là một ngành lặng lẽ không bao giờ được quét.
 */
describe('phân loại trên phần chức danh, không phải cả headline', () => {
  const cases: Array<[string, string]> = [
    ['Kỹ sư cơ khí | Mechanical Engineer', 'MANUFACTURING'],
    ['Kế toán tổng hợp | 5 năm kinh nghiệm', 'FINANCE'],
    ['Điều dưỡng viên | Khoa Hồi sức tích cực', 'HEALTHCARE'],
    ['Nhân viên kinh doanh B2B · Thiết bị công nghiệp', 'SALES'],
  ];

  test.each(cases)('%s -> %s', (headline, expected) => {
    expect(profileOccupation({ headline, primarySkills: [] })).toBe(expected);
  });

  test('cùng một headline cho ra cùng một chức danh ở cả hai đường', () => {
    // Bộ phân loại ngành và bộ sinh từ khoá phải nhìn thấy y hệt nhau, nếu
    // không thì hồ sơ vào cụm này mà từ khoá lại của nghề khác.
    const headline = 'Kỹ sư cơ khí | Mechanical Engineer';
    expect(jobTitleOf(headline)).toBe('Kỹ sư cơ khí');
    expect(profileOccupation({ headline, primarySkills: [] })).toBe(
      'MANUFACTURING',
    );
  });
});
