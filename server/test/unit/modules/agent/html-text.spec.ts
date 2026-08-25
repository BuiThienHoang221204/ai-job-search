import { pageToText } from 'src/modules/agent/utils/html-text.js';

/**
 * Mốc cắt 20.000 ký tự là thứ đã hỏng âm thầm: trang TopCV để "Mô tả công việc"
 * ở ký tự 23.013, nên model chỉ nhận được biểu ngữ cookie rồi kết luận trang là
 * SPA. Những test này ghim đúng ba thứ đã dọn để đưa nội dung lên đầu.
 */
describe('pageToText', () => {
  it('bỏ khung trang nhưng giữ nội dung', () => {
    const html = [
      '<header><a>Đăng nhập</a></header>',
      '<nav><a>Việc làm</a><a>Công ty</a></nav>',
      '<main><h2>Mô tả công việc</h2><p>Hạch toán kế toán</p></main>',
      '<footer><p>Tổng đài 1900</p></footer>',
    ].join('');

    expect(pageToText(html)).toBe('Mô tả công việc\nHạch toán kế toán');
  });

  it('bỏ dòng khung mẫu Vue chưa render', () => {
    const html = '<p>{{ company?.name }}</p><p>Công ty Phúc Anh</p>';

    expect(pageToText(html)).toBe('Công ty Phúc Anh');
  });

  it('bỏ dòng ngắn lặp lại nhưng giữ dòng dài lặp lại', () => {
    const dai =
      'Yêu cầu kinh nghiệm hai năm ở vị trí kế toán tổng hợp hoặc kế toán thuế, thành thạo Excel.';
    const html = `<p>Xem chi tiết</p><p>Xem chi tiết</p><p>${dai}</p><p>${dai}</p>`;

    expect(pageToText(html)).toBe(`Xem chi tiết\n${dai}\n${dai}`);
  });

  it('trả chuỗi rỗng cho trang chỉ có khung', () => {
    expect(
      pageToText('<nav><a>Trang chủ</a></nav><script>var a=1</script>'),
    ).toBe('');
  });
});
