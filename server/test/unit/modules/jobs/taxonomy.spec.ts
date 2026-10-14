import {
  OCCUPATIONS,
  OTHER_CODE,
} from 'src/modules/jobs/taxonomy/occupations.js';
import { PORTAL_CATEGORY_OCCUPATION } from 'src/modules/jobs/taxonomy/portal-categories.js';
import { PROVINCES } from 'src/modules/jobs/taxonomy/provinces.js';
import { normalizeText } from 'src/common/text/vietnamese.js';
import {
  buildSearchText,
  resolveOccupation,
  resolveProvince,
  resolveSubOccupation,
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

  test.each([
    ['Senior Business Analyst', 'IT'],
    ['Flutter Dev, 18-27M', 'IT'],
    ['Security Operations Center Analyst', 'IT'],
    ['Chuyên viên Công nghệ Thông tin', 'IT'],
    ['Data Lake Manager', 'DATA_AI'],
    ['ACCOUNTING TEAM LEADER', 'FINANCE'],
    ['Nhân Viên An Toàn Lao Động HSE', 'MANUFACTURING'],
    ['Giám sát QC - Kiểm Soát Chất Lượng Hải Sản', 'MANUFACTURING'],
    ['Nhân Viên Giám Sát MEP', 'CONSTRUCTION'],
    ['Bếp trưởng', 'HOSPITALITY'],
    ['Brand Manager', 'MARKETING'],
    ['Nhân Viên Telesale', 'SALES'],
    ['[Aeon Đà Nẵng] Trưởng Quầy Thực Phẩm Tươi Sống', 'RETAIL'],
    ['Chief Financial Officer', 'FINANCE'],
    ['Data Analysis Officer (AEON Group Point)', 'DATA_AI'],
    ['Inspector 3, IQC', 'MANUFACTURING'],
    ['Kỹ sư Khối lượng', 'CONSTRUCTION'],
    ['BIM Engineer (Transportation Infrastructure)', 'CONSTRUCTION'],
  ])('tiêu đề từng rơi vào OTHER: %s -> %s', (title, code) => {
    expect(resolveOccupation(title, [])).toBe(code);
  });

  /// Từ khoá dự phòng là chữ chung chung hay đi kèm như một bổ ngữ; nó chỉ được thắng khi không nhóm nào khớp từ khoá chính.
  test.each([
    ['Senior Full Stack Engineer (AI)', 'IT'],
    ['Nhân viên Kinh doanh Dự án CNTT', 'SALES'],
    ['Giảng Viên Công Nghệ Thông Tin', 'EDUCATION'],
    ['Nhân viên quản lý chất lượng Xây dựng', 'CONSTRUCTION'],
    ['Store Manager - Cửa hàng trưởng brand Crocs', 'RETAIL'],
    ['Ocean Freight Operator', 'LOGISTICS'],
  ])(
    'từ khoá dự phòng không giành tin của nhóm khác: %s -> %s',
    (title, code) => {
      expect(resolveOccupation(title, [])).toBe(code);
    },
  );

  /// `dien tu` của nhóm Sản xuất từng khớp ngay bên trong cụm này: 8 tin vận hành sàn TMĐT trên production nằm ở Sản xuất.
  test.each([
    ['Nhân viên Vận hành Sàn Thương mại Điện tử', 'RETAIL'],
    ['Kỹ sư điện tử', 'MANUFACTURING'],
  ])(
    '"thương mại điện tử" không bị đọc thành "điện tử": %s -> %s',
    (title, code) => {
      expect(resolveOccupation(title, [])).toBe(code);
    },
  );

  /// Tin "Content Creator" mang nhãn "Marketing - PR" từng nằm ở Thiết kế vì DESIGN đứng trước MARKETING trong danh mục.
  test.each([
    ['Nhân viên Sáng tạo Nội dung (Content Creator)', 'MARKETING'],
    ['Content Creator TikTok', 'MARKETING'],
    ['Graphic Designer', 'DESIGN'],
  ])(
    'sáng tạo nội dung là Marketing, không phải Thiết kế: %s -> %s',
    (title, code) => {
      expect(resolveOccupation(title, [])).toBe(code);
    },
  );

  test('không khớp gì thì về OTHER, không phải null', () => {
    expect(resolveOccupation('Chuyên viên cao cấp', [])).toBe(OTHER_CODE);
  });
});

describe('resolveOccupation - nhãn ngành của portal', () => {
  test('nhãn portal thắng từ khoá DỰ PHÒNG của tiêu đề', () => {
    expect(
      resolveOccupation('Kỹ sư quản lý chất lượng', [], ['Xây Dựng']),
    ).toBe('CONSTRUCTION');
  });

  /// Đo 2026-10-13 trên CareerViet: nhà tuyển dụng hay chọn kèm ngành của CÔNG TY, nên nhãn không được đè tiêu đề đã nói rõ nghề.
  test('từ khoá CHÍNH của tiêu đề thắng nhãn portal', () => {
    expect(
      resolveOccupation(
        'Marketing Officer',
        [],
        ['Y tế / Chăm sóc sức khỏe / Thẩm mỹ / Làm đẹp'],
      ),
    ).toBe('MARKETING');
  });

  test('tiêu đề mơ hồ thì nhãn portal quyết định', () => {
    expect(
      resolveOccupation('Chuyên viên cao cấp', [], ['Tiếp thị / Marketing']),
    ).toBe('MARKETING');
  });

  test('nghề con xét trước nhóm cha', () => {
    expect(
      resolveOccupation(
        'Chuyên viên',
        [],
        ['Data Engineer/Data Analyst/AI', 'Công Nghệ Thông Tin/Viễn Thông'],
      ),
    ).toBe('DATA_AI');
  });

  /// "Sản Xuất Chương Trình" là sản xuất chương trình truyền hình; từ khoá `san xuat` sẽ xếp nó vào nhà máy.
  test('bảng đổi thắng từ khoá trên chính nhãn', () => {
    expect(
      resolveOccupation('Chuyên viên', [], ['Sản Xuất Chương Trình']),
    ).toBe('DESIGN');
  });

  test('nhãn không mang thông tin ngành thì đi tiếp xuống tiêu đề', () => {
    expect(
      resolveOccupation('Kế toán trưởng', [], ['Quản Lý Cấp Cao', 'Khác']),
    ).toBe('FINANCE');
  });

  test('nhãn lạ chưa có trong bảng vẫn xếp được bằng từ khoá', () => {
    expect(
      resolveOccupation('Chuyên viên', [], ['IT phần mềm, Thống kê']),
    ).toBe('IT');
  });

  test('không có nhãn thì giữ nguyên hành vi theo tiêu đề', () => {
    expect(resolveOccupation('Backend Developer', [])).toBe('IT');
  });

  /// Nhãn thật của 123job, TopDev, JobOKO gom ngày 2026-10-13.
  test.each([
    ['Kế toán - Kiểm toán', 'FINANCE'],
    ['Hành chính - Văn phòng', 'HR'],
    ['Tư vấn/ Chăm sóc khách hàng', 'CUSTOMER'],
    ['Xuất - Nhập khẩu', 'LOGISTICS'],
    ['Vận tải - Lái xe/ Tài xế', 'MANUAL'],
    ['Công nghệ thông tin', 'IT'],
    ['Hành chính - Nhân sự', 'HR'],
    ['Giáo dục - Đào tạo', 'EDUCATION'],
  ])('nhãn %s -> %s', (label, code) => {
    expect(resolveOccupation('Chuyên viên', [], [label])).toBe(code);
  });

  test('nhãn chỉ hình thức hoặc quá mơ hồ bị bỏ qua để xét nhãn sau', () => {
    expect(
      resolveOccupation(
        'Chuyên viên',
        [],
        ['Thực tập', 'Phát triển thị trường', 'Kế toán - Kiểm toán'],
      ),
    ).toBe('FINANCE');
    expect(resolveOccupation('Chuyên viên', [], ['Thực tập'])).toBe('OTHER');
  });

  test('nhãn portal góp vào việc chọn nghề con', () => {
    expect(
      resolveSubOccupation('DESIGN', 'Chuyên viên', ['Thiết Kế Đồ Họa']),
    ).not.toBeNull();
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
      for (const keyword of [
        ...occupation.keywords,
        ...(occupation.fallbackKeywords ?? []),
      ]) {
        expect(seen.get(keyword) ?? occupation.code).toBe(occupation.code);
        seen.set(keyword, occupation.code);
      }
    }
  });

  test('bảng nhãn portal chỉ trỏ tới mã ngành có thật', () => {
    const codes = new Set(OCCUPATIONS.map((occupation) => occupation.code));

    for (const code of Object.values(PORTAL_CATEGORY_OCCUPATION)) {
      if (code !== null) expect(codes.has(code)).toBe(true);
    }
  });

  /// Hai nhãn chỉ khác hoa/thường hay dấu sẽ thành một khoá sau chuẩn hoá, và nhãn sau đè nhãn trước trong im lặng.
  test('nhãn portal không trùng nhau sau chuẩn hoá', () => {
    const keys = Object.keys(PORTAL_CATEGORY_OCCUPATION).map(normalizeText);

    expect(new Set(keys).size).toBe(keys.length);
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
      for (const keyword of [
        ...occupation.keywords,
        ...(occupation.fallbackKeywords ?? []),
      ]) {
        expect(keyword).toBe(normalizeText(keyword));
      }
    }
  });
});
