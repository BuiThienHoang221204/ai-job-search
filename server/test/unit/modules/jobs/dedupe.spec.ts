import { dedupeKeyOf, stripNoise } from 'src/modules/jobs/taxonomy/dedupe.js';
import { normalizeText } from 'src/modules/jobs/taxonomy/resolve.js';

/// Khoá này quyết định một tin có bị coi là bản sao hay không, tức là có tốn
/// một lượt gọi model hay không. Sai theo hướng gộp thừa thì tin thật biến mất
/// khỏi danh sách mà không có lỗi nào được ghi ra - nên nó cần test riêng.
describe('stripNoise', () => {
  test('bỏ nhãn tuyển gấp', () => {
    expect(stripNoise(normalizeText('Tuyển gấp Nhân viên kinh doanh'))).toBe(
      'nhan vien kinh doanh',
    );
  });

  test('cắt mọi thứ từ chỗ nói về lương', () => {
    expect(
      stripNoise(normalizeText('Kế toán tổng hợp - Lương up to 20 triệu')),
    ).toBe('ke toan tong hop');
    expect(
      stripNoise(normalizeText('Backend Developer (Thu nhập 2000 USD)')),
    ).toBe('backend developer');
  });

  test('bỏ tên tỉnh nhắc lại trong tiêu đề', () => {
    expect(stripNoise(normalizeText('Nhân viên kinh doanh Hà Nội'))).toBe(
      'nhan vien kinh doanh',
    );
  });

  test('giữ nguyên từ thật trông giống nhãn trang trí', () => {
    expect(stripNoise(normalizeText('Chuyên viên môi giới'))).toBe(
      'chuyen vien moi gioi',
    );
  });
});

describe('dedupeKeyOf', () => {
  test('cùng một tin trên hai portal ra cùng khoá', () => {
    const topcv = dedupeKeyOf(
      'Tuyển gấp Kế toán tổng hợp',
      'Công ty FPT',
      'HN',
    );
    const vnw = dedupeKeyOf(
      'Kế toán tổng hợp - Lương up to 20 triệu',
      'công ty FPT',
      'HN',
    );
    expect(topcv).toBe(vnw);
  });

  test('khác tỉnh là khác việc', () => {
    expect(dedupeKeyOf('Kế toán', 'FPT', 'HN')).not.toBe(
      dedupeKeyOf('Kế toán', 'FPT', 'HCM'),
    );
  });

  test('khác chức danh là khác việc', () => {
    expect(dedupeKeyOf('Kế toán trưởng', 'FPT', 'HN')).not.toBe(
      dedupeKeyOf('Kế toán tổng hợp', 'FPT', 'HN'),
    );
  });

  test('công ty ẩn danh thì không gộp', () => {
    expect(dedupeKeyOf('Kế toán', 'Không rõ', 'HN')).toBeNull();
    expect(dedupeKeyOf('Kế toán', 'Confidential', 'HN')).toBeNull();
  });

  test('tiêu đề chỉ có nhiễu thì không gộp', () => {
    expect(dedupeKeyOf('Tuyển gấp', 'FPT', 'HN')).toBeNull();
  });

  test('không có tỉnh vẫn ra khoá, và khác với tin có tỉnh', () => {
    expect(dedupeKeyOf('Kế toán', 'FPT', null)).toBe('fpt|ke toan|');
  });
});
