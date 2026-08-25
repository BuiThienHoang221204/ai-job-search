import { containsTerm, foldTerm } from 'src/modules/matching/skill-term.js';

describe('foldTerm', () => {
  test('bỏ dấu tiếng Việt và hạ chữ thường', () => {
    expect(foldTerm('Kế Toán Tổng Hợp')).toBe('ke toan tong hop');
  });

  test('`đ` phải xử lý riêng vì NFD không tách nó ra', () => {
    expect(foldTerm('Điều dưỡng')).toBe('dieu duong');
  });

  test('GIỮ ký hiệu: bỏ chúng đi thì C++ và .NET mất phần định danh', () => {
    expect(foldTerm('C++')).toBe('c++');
    expect(foldTerm('.NET')).toBe('.net');
    expect(foldTerm('C#')).toBe('c#');
  });
});

describe('containsTerm', () => {
  test('khớp theo TỪ, không phải chuỗi con', () => {
    expect(containsTerm('Technical excellence', 'Excel')).toBe(false);
    expect(containsTerm('Sapphire platform', 'SAP')).toBe(false);
    expect(containsTerm('Digital Marketing', 'IT')).toBe(false);
    expect(containsTerm('Quality Control', 'IT')).toBe(false);
  });

  test('ký hiệu vẫn khớp được vì biên từ chỉ áp ở phía kết bằng chữ số', () => {
    expect(containsTerm('ASP.NET Core', '.NET')).toBe(true);
    expect(containsTerm('C++ developer', 'C++')).toBe(true);
  });

  test('không phân biệt dấu: hồ sơ gõ không dấu vẫn khớp tin có dấu', () => {
    expect(containsTerm('Kế toán tổng hợp', 'ke toan')).toBe(true);
    expect(containsTerm('ke toan tong hop', 'Kế toán')).toBe(true);
  });

  test('từ khoá dưới 2 ký tự thì bỏ qua, không khớp bừa', () => {
    expect(containsTerm('Quản lý kho', 'K')).toBe(false);
  });
});
