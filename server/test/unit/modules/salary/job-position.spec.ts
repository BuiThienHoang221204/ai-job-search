import {
  buildPositionIndex,
  resolveJobPosition,
  roleTokens,
} from 'src/modules/salary/utils/job-position.js';
import type { ReferencePosition } from 'src/modules/salary/salary.types.js';

const position = (
  positionSlug: string,
  positionName: string,
  occupationCode: string,
): ReferencePosition => ({
  positionSlug,
  positionName,
  occupationCode,
  avgMonthly: 20_000_000,
  rangeMin: 10_000_000,
  rangeMax: 30_000_000,
  currency: 'VND',
  bands: [],
});

const REFERENCES: ReferencePosition[] = [
  position(
    'accounting-auditing-finance-general-accountant',
    'Kế toán tổng hợp',
    'FINANCE',
  ),
  position('accounting-auditing-finance-accountant', 'Kế toán viên', 'FINANCE'),
  position(
    'accounting-auditing-finance-chief-accountant',
    'Kế toán trưởng',
    'FINANCE',
  ),
  position('business-sales-sales-engineer', 'Kỹ sư kinh doanh', 'SALES'),
  position('business-sales-sales-executive', 'Nhân viên kinh doanh', 'SALES'),
  position(
    'business-sales-b2b-sales-executive',
    'Nhân viên kinh doanh B2B',
    'SALES',
  ),
  position('it-software-backend-developer', 'Lập trình viên Backend', 'IT'),
  position('it-software-devops-engineer', 'Kỹ sư DevOps', 'IT'),
  position('it-software-it-executive', 'Nhân viên công nghệ thông tin', 'IT'),
  position('it-software-nodejs-developer', 'Lập trình viên Node.js', 'IT'),
  position('it-software-java-developer', 'Lập trình viên Java', 'IT'),
  position('it-software-php-developer', 'Lập trình viên PHP', 'IT'),
  position('it-software-python-developer', 'Lập trình viên Python', 'IT'),
  position('it-software-net-developer', 'Lập trình viên .NET', 'IT'),
];

const index = buildPositionIndex(REFERENCES);

const resolve = (
  title: string,
  occupationCode: string | null,
  subOccupationCode: string | null = null,
) => resolveJobPosition({ title, occupationCode, subOccupationCode }, index);

describe('roleTokens', () => {
  test('giữ "kinh doanh" nhưng bỏ "kinh nghiệm"', () => {
    expect(roleTokens('Nhân viên kinh doanh')).toContain('doanh');
    expect(roleTokens('Kế toán 2 năm kinh nghiệm')).not.toContain('nghiem');
  });

  test('giữ tiền tố chức danh để phân biệt cấp bậc', () => {
    expect(roleTokens('Kỹ sư kinh doanh')).toEqual(
      expect.arrayContaining(['ky', 'su']),
    );
    expect(roleTokens('Nhân viên kinh doanh')).toEqual(
      expect.arrayContaining(['nhan', 'vien']),
    );
  });
});

describe('resolveJobPosition - tầng POSITION', () => {
  test('khớp đúng vị trí khi tiêu đề sạch', () => {
    expect(resolve('Kế Toán Tổng Hợp', 'FINANCE')).toMatchObject({
      basis: 'POSITION',
      label: 'Kế toán tổng hợp',
    });
  });

  test('bỏ được đuôi trang trí của tiêu đề', () => {
    expect(
      resolve(
        'Kế Toán Tổng Hợp - 2 Năm Kinh Nghiệm - Thu Nhập Hấp Dẫn',
        'FINANCE',
      ),
    ).toMatchObject({ label: 'Kế toán tổng hợp' });
  });

  test('không nhầm nhân viên kinh doanh thành kỹ sư kinh doanh', () => {
    expect(resolve('Nhân viên kinh doanh', 'SALES')).toMatchObject({
      label: 'Nhân viên kinh doanh',
    });
  });

  test('vị trí cụ thể hơn thắng khi cùng điểm', () => {
    expect(resolve('Nhân Viên Kinh Doanh Sales B2B', 'SALES')).toMatchObject({
      label: 'Nhân viên kinh doanh B2B',
    });
  });

  test('chỉ đọc phần đầu tiêu đề, không đọc tên phòng ban ở đuôi', () => {
    const resolved = resolve(
      'Senior BackEnd Engineer (Java, Go) - Khối Công nghệ thông tin',
      'IT',
    );
    expect(resolved?.label).not.toBe('Nhân viên công nghệ thông tin');
  });

  test('không khớp bừa khi chỉ trùng một token', () => {
    expect(resolve('Kỹ Sư Cơ Khí / Mechanical Engineer', 'IT')).toBeNull();
  });
});

describe('resolveJobPosition - tầng SUB_OCCUPATION', () => {
  test('gom nhóm vị trí khi tiêu đề không khớp vị trí nào', () => {
    const resolved = resolve(
      'Kỹ Sư Lập Trình Back- end (Middle)',
      'IT',
      'IT_BACKEND',
    );
    expect(resolved?.basis).toBe('SUB_OCCUPATION');
    expect(resolved?.positions.length).toBeGreaterThan(1);
  });

  test('tầng POSITION được ưu tiên trước tầng nhóm', () => {
    expect(resolve('Lập trình viên Java', 'IT', 'IT_BACKEND')).toMatchObject({
      basis: 'POSITION',
      label: 'Lập trình viên Java',
    });
  });

  test('nhóm không có vị trí tham chiếu thì trả null, không ép về ngành', () => {
    expect(
      resolve('Nhân Viên Xuất Nhập Khẩu', 'LOGISTICS', 'LOG_IMPEXP'),
    ).toBeNull();
    expect(
      resolve('Giáo Viên Tiếng Anh', 'EDUCATION', 'EDU_TEACHER'),
    ).toBeNull();
  });

  test('không có mã ngành lẫn mã nghề thì trả null', () => {
    expect(resolve('Một chức danh lạ', null, null)).toBeNull();
  });
});
