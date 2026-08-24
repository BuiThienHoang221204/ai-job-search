import { companyKeyOf } from 'src/modules/companies/company-key.js';

/// Khoá này quyết định hai tin có dùng chung một bản tìm hiểu công ty hay
/// không. Gộp thừa thì người dùng đọc phải đánh giá của một công ty khác mà
/// không có gì báo; gộp thiếu chỉ tốn thêm một lượt gọi model. Hai kiểu sai
/// lệch nhau rất xa về mức thiệt hại, nên cả hai chiều đều cần test riêng.
describe('companyKeyOf', () => {
  test('mọi cách viết loại hình pháp nhân về chung một khoá', () => {
    const expected = 'fpt software';

    expect(companyKeyOf('FPT Software')).toBe(expected);
    expect(companyKeyOf('Công ty TNHH FPT Software')).toBe(expected);
    expect(companyKeyOf('CÔNG TY CỔ PHẦN FPT SOFTWARE')).toBe(expected);
    expect(companyKeyOf('Cty CP FPT Software')).toBe(expected);
    expect(companyKeyOf('FPT Software Co., Ltd')).toBe(expected);
    expect(companyKeyOf('FPT Software JSC')).toBe(expected);
    expect(companyKeyOf('  FPT   Software  ')).toBe(expected);
  });

  test('bỏ loại hình pháp nhân nằm giữa tên', () => {
    expect(companyKeyOf('Tập đoàn Công nghệ CMC')).toBe('cong nghe cmc');
    expect(companyKeyOf('Chi nhánh Ngân hàng ACB Hà Nội')).toBe(
      'ngan hang acb ha noi',
    );
  });

  test('KHÔNG gộp hai pháp nhân khác nhau chỉ vì tên gần giống', () => {
    expect(companyKeyOf('Samsung Vietnam')).not.toBe(companyKeyOf('Samsung'));
    expect(companyKeyOf('FPT Telecom')).not.toBe(companyKeyOf('FPT Software'));
  });

  test('công ty ẩn danh trả null - không có gì để tìm hiểu', () => {
    expect(companyKeyOf('Công ty bảo mật')).toBeNull();
    expect(companyKeyOf('CONFIDENTIAL')).toBeNull();
    expect(companyKeyOf('Không rõ')).toBeNull();
  });

  test('tên chỉ còn loại hình pháp nhân thì trả null, không trả chuỗi rỗng', () => {
    expect(companyKeyOf('Công ty TNHH')).toBeNull();
    expect(companyKeyOf('Cty CP')).toBeNull();
    expect(companyKeyOf('   ')).toBeNull();
    expect(companyKeyOf('')).toBeNull();
  });

  test('từ thật trông giống loại hình pháp nhân vẫn được giữ', () => {
    expect(companyKeyOf('Incom Việt Nam')).toBe('incom viet nam');
    expect(companyKeyOf('Ltda Group')).toBe('ltda group');
  });

  /// "Cơ khí" bỏ dấu thành "co khi". Thêm `co` vào danh sách loại hình pháp
  /// nhân để bắt "Co., Ltd" sẽ xoá mất chữ "cơ" của cả một ngành nghề.
  test('không xoá nhầm "cơ" trong tên ngành nghề', () => {
    expect(companyKeyOf('Công ty Cơ khí Hà Nội')).toBe('co khi ha noi');
    expect(companyKeyOf('Cơ điện lạnh REE')).toBe('co dien lanh ree');
  });
});
