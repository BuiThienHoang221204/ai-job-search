import {
  OCCUPATIONS,
  OTHER_CODE,
} from 'src/modules/jobs/taxonomy/occupations.js';
import { PROVINCES } from 'src/modules/jobs/taxonomy/provinces.js';
import {
  buildSearchText,
  normalizeText,
  resolveOccupation,
  resolveProvince,
} from 'src/modules/jobs/taxonomy/resolve.js';

/// Ba hàm này là ranh giới giữa dữ liệu bẩn từ portal và bộ lọc chạy bằng index.
///
/// Chúng đáng có test riêng vì sai ở đây không gây lỗi nào: tin vẫn lưu được,
/// API vẫn 200, chỉ có điều tin không bao giờ xuất hiện khi lọc theo tỉnh của
/// chính nó - và không ai phát hiện ra cho tới khi có người đi tìm đúng tin đó.
describe('normalizeText', () => {
  test('bỏ dấu tiếng Việt', () => {
    expect(normalizeText('Hà Nội')).toBe('ha noi');
    expect(normalizeText('Đà Nẵng')).toBe('da nang');
  });

  test('`đ` thành `d` - NFD không tách được ký tự này', () => {
    expect(normalizeText('Đồng Nai')).toBe('dong nai');
    expect(normalizeText('điện tử')).toBe('dien tu');
  });

  test('mọi dấu câu thành một dấu cách', () => {
    expect(normalizeText('Quận 1, TP.HCM')).toBe('quan 1 tp hcm');
    expect(normalizeText('  Kế   toán  ')).toBe('ke toan');
  });
});

describe('resolveProvince', () => {
  test.each([
    ['Hà Nội', 'HN'],
    ['ha noi', 'HN'],
    ['Hồ Chí Minh', 'HCM'],
    ['TP.HCM', 'HCM'],
    ['Quận 1, TP.HCM', 'HCM'],
    ['Ho Chi Minh City', 'HCM'],
    ['Sài Gòn', 'HCM'],
    ['Đà Nẵng', 'DN'],
    ['danang', 'DN'],
  ])('%s -> %s', (location, code) => {
    expect(resolveProvince(location)).toBe(code);
  });

  test('tỉnh cũ đã sáp nhập vẫn ra mã của tỉnh mới', () => {
    expect(resolveProvince('Bình Dương')).toBe('HCM');
    expect(resolveProvince('Bà Rịa - Vũng Tàu')).toBe('HCM');
  });

  test('làm việc từ xa không gắn vào tỉnh nào', () => {
    expect(resolveProvince('Remote')).toBe('REMOTE');
    expect(resolveProvince('Làm việc từ xa')).toBe('REMOTE');
  });

  test('không suy được thì trả null, KHÔNG đoán bừa', () => {
    expect(resolveProvince(null)).toBeNull();
    expect(resolveProvince('')).toBeNull();
    expect(resolveProvince('Singapore')).toBeNull();
    expect(resolveProvince('Toàn quốc')).toBeNull();
  });

  /// Khớp theo TỪ chứ không theo chuỗi con: "Hanoi" nằm trong "Hanoinet" nhưng
  /// đó là tên công ty, không phải địa điểm.
  test('không khớp khi tên tỉnh chỉ là một phần của từ khác', () => {
    expect(resolveProvince('Hanoinetwork')).toBeNull();
  });
});

describe('resolveOccupation', () => {
  test.each([
    ['Backend Developer', 'IT'],
    ['Lập trình viên PHP', 'IT'],
    ['Data Analyst', 'DATA_AI'],
    ['Nhân viên Kế toán tổng hợp', 'FINANCE'],
    ['Chuyên viên Tuyển dụng', 'HR'],
    ['Nhân viên Kinh doanh', 'SALES'],
    ['Giáo viên Tiếng Anh', 'EDUCATION'],
    ['Điều dưỡng viên', 'HEALTHCARE'],
    ['Công nhân may', 'MANUAL'],
    ['Đầu bếp Á', 'HOSPITALITY'],
  ])('%s -> %s', (title, code) => {
    expect(resolveOccupation(title, [])).toBe(code);
  });

  test('tiêu đề thắng thẻ - thẻ là thứ portal gắn rộng tay', () => {
    expect(resolveOccupation('Kế toán trưởng', ['IT', 'Software'])).toBe(
      'FINANCE',
    );
  });

  test('không suy được từ tiêu đề thì mới xét tới thẻ', () => {
    expect(resolveOccupation('Chuyên viên cao cấp', ['ReactJS'])).toBe('IT');
  });

  /// Thẻ portal viết dính: `ReactJS`, `NodeJS`. Khớp trọn từ sẽ trượt cả ba.
  test.each(['ReactJS', 'NodeJS', 'Golang'])('thẻ %s vẫn ra IT', (tag) => {
    expect(resolveOccupation('Chuyên viên cao cấp', [tag])).toBe('IT');
  });

  test('không khớp gì thì về OTHER, không phải null', () => {
    expect(resolveOccupation('Chuyên viên cao cấp', [])).toBe(OTHER_CODE);
  });
});

describe('buildSearchText', () => {
  test('gộp tiêu đề, công ty và thẻ, đã bỏ dấu', () => {
    expect(
      buildSearchText('Kỹ sư Cầu nối', 'Công ty ABC', ['Tiếng Nhật']),
    ).toBe('ky su cau noi cong ty abc tieng nhat');
  });

  /// Cột `searchText` và chuỗi người dùng gõ phải đi qua CÙNG một hàm chuẩn
  /// hoá. Lệch nhau thì gõ "ha noi" sẽ không khớp tin ghi "Hà Nội".
  test('gõ không dấu vẫn khớp tin có dấu', () => {
    const stored = buildSearchText('Lập trình viên', 'FPT Software', []);

    expect(stored).toContain(normalizeText('lap trinh vien'));
    expect(stored).toContain(normalizeText('Lập Trình Viên'));
  });
});

describe('tính toàn vẹn của hai danh mục', () => {
  test('mã tỉnh không trùng nhau', () => {
    const codes = PROVINCES.map((province) => province.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  test('mã ngành không trùng nhau', () => {
    const codes = OCCUPATIONS.map((occupation) => occupation.code);

    expect(new Set(codes).size).toBe(codes.length);
  });

  /// Một từ khoá nằm ở hai nhóm nghĩa là nhóm đứng sau không bao giờ thắng bằng
  /// từ đó - im lặng và rất khó thấy khi đọc danh mục.
  test('một từ khoá chỉ thuộc đúng một nhóm ngành', () => {
    const seen = new Map<string, string>();

    for (const occupation of OCCUPATIONS) {
      for (const keyword of occupation.keywords) {
        expect(seen.get(keyword) ?? occupation.code).toBe(occupation.code);
        seen.set(keyword, occupation.code);
      }
    }
  });

  test('mọi alias đều đã ở dạng chuẩn hoá', () => {
    for (const province of PROVINCES) {
      for (const alias of province.aliases) {
        expect(alias).toBe(normalizeText(alias));
      }
    }
  });

  test('mọi từ khoá ngành đều đã ở dạng chuẩn hoá', () => {
    for (const occupation of OCCUPATIONS) {
      for (const keyword of occupation.keywords) {
        expect(keyword).toBe(normalizeText(keyword));
      }
    }
  });
});
