import {
  containsTerm,
  countTerms,
  foldTerm,
} from 'src/common/text/vietnamese.js';

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

describe('countTerms', () => {
  test('đếm số kỹ năng KHÁC NHAU xuất hiện trong tin', () => {
    const text = 'Tuyển DevOps Engineer, dùng Kubernetes và Terraform';
    expect(countTerms(text, ['DevOps', 'Kubernetes', 'Terraform'])).toBe(3);
    expect(countTerms(text, ['DevOps', 'React'])).toBe(1);
  });

  test('không phân biệt hoa thường và không đếm trùng', () => {
    expect(countTerms('kubernetes KUBERNETES', ['Kubernetes'])).toBe(1);
    expect(countTerms('Kubernetes', ['kubernetes', 'KUBERNETES'])).toBe(1);
  });

  test('bỏ qua từ khoá quá ngắn', () => {
    // Một ký tự khớp gần như mọi tin, chỉ làm nhiễu thứ hạng.
    expect(countTerms('DevOps Engineer', ['a', 'e'])).toBe(0);
  });

  /*
   * Hai ca này là lý do hàm được viết lại. Khớp chuỗi con từng cho `Excel` dính
   * vào "technical excellence" và `SAP` dính vào tên toà nhà "Sapphire" - mà
   * mọi tin IT tiếng Anh đều có chữ "excellence", nên MỌI hồ sơ phi-IT có khai
   * Excel đều bị ghép với chúng rồi tốn một lượt gọi model cho từng cặp.
   */
  test('không khớp khi từ khoá chỉ là một phần của từ khác', () => {
    expect(countTerms('technical excellence and impact', ['Excel'])).toBe(0);
    expect(countTerms('- Excellent problem-solving', ['Excel'])).toBe(0);
    expect(countTerms('Podium Floor, Sapphire 2 tower', ['SAP'])).toBe(0);
  });

  test('vẫn khớp khi từ khoá đứng thành một từ trọn vẹn', () => {
    expect(countTerms('Thành thạo Excel, MISA', ['Excel'])).toBe(1);
    expect(countTerms('Kinh nghiệm SAP B1', ['SAP'])).toBe(1);
    expect(countTerms('báo cáo trên excel.', ['Excel'])).toBe(1);
  });

  test('không cắt nhầm từ khoá có ký tự đặc biệt', () => {
    // `\b` của JS đặt biên sai ở những từ khoá này, nên biên phải tự dựng.
    expect(countTerms('Backend C++ và C#', ['C++', 'C#'])).toBe(2);
    expect(countTerms('Xây dựng ASP.NET Core', ['.NET'])).toBe(1);
    expect(countTerms('Node.js + React.js', ['Node.js'])).toBe(1);
  });

  test('khớp được tiếng Việt có dấu', () => {
    const text = 'Tuyển Kế toán tổng hợp, làm báo cáo thuế hàng quý';
    expect(countTerms(text, ['Kế toán tổng hợp', 'Báo cáo thuế'])).toBe(2);
    expect(countTerms(text, ['Kế toán trưởng'])).toBe(0);
  });
});
