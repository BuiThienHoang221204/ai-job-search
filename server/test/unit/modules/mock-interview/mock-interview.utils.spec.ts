import { closingOf } from 'src/modules/mock-interview/utils/mock-interview.js';

describe('closingOf', () => {
  test('buổi DONE lấy chữ bước cuối làm tổng kết', () => {
    expect(closingOf('DONE', [{ text: '  Tổng kết buổi.  ' }])).toBe(
      'Tổng kết buổi.',
    );
  });

  test('buổi chưa xong hoặc bước cuối rỗng thì không có tổng kết', () => {
    expect(closingOf('WAITING_USER', [{ text: 'Nhận xét' }])).toBeNull();
    expect(closingOf('DONE', [{ text: '   ' }])).toBeNull();
    expect(closingOf('DONE', [])).toBeNull();
  });
});
