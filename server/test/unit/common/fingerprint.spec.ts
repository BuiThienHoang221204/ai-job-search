import { createHash } from 'node:crypto';
import { fingerprint } from 'src/common/fingerprint.js';

/// Giá trị ghim cứng: `sourceHash`/`promptHash` đã LƯU trong database, đổi một byte là mọi tin bị rút trích và chấm điểm lại.
describe('fingerprint', () => {
  test('các phần nối liền nhau, KHÔNG có dấu phân cách', () => {
    expect(fingerprint(['a', 'b'])).toBe(
      createHash('sha256').update('ab').digest('hex').slice(0, 32),
    );
  });

  test('giữ nguyên giá trị đã lưu trong database', () => {
    expect(fingerprint(['a', 'b'])).toBe('fb8e20fc2e4c3f248c60c39bd652f3c1');
    expect(fingerprint(['Kế toán', 'Mô tả', 'Hà Nội', ''])).toBe(
      '012f058e74ce0c1bb158736bae126809',
    );
  });

  test('cắt theo độ dài truyền vào', () => {
    expect(fingerprint(['body', 'x.md', 'ref'], 16)).toBe('61cdebb612280615');
  });

  test('không có phần nào thì là sha256 của chuỗi rỗng', () => {
    expect(fingerprint([])).toBe('e3b0c44298fc1c149afbf4c8996fb924');
  });
});
