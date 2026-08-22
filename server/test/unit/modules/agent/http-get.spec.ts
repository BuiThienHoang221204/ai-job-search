import { pinArgs, splitTrailer } from 'src/modules/agent/utils/http-get.js';

/**
 * Hai hàm thuần này giữ hai thứ dễ vỡ âm thầm: ranh giới giữa thân trang và
 * dòng trạng thái do `curl -w` ghi ra, và việc ghim tên miền vào địa chỉ đã
 * kiểm. Sai cái đầu thì model nhận trang thiếu chữ hoặc thừa rác mà không có
 * lỗi nào; sai cái sau thì vòng chống SSRF vẫn chạy nhưng không còn hiệu lực.
 */
describe('splitTrailer', () => {
  it('tách trạng thái và chặng kế tiếp ra khỏi thân trang', () => {
    const stdout = '<html>\n<body>Tin tuyển dụng</body>\n302 https://x.test/a';

    expect(splitTrailer(stdout)).toEqual({
      body: '<html>\n<body>Tin tuyển dụng</body>',
      status: 302,
      next: 'https://x.test/a',
    });
  });

  it('trả chặng rỗng khi không có chuyển hướng', () => {
    const { body, status, next } = splitTrailer('<html>Nội dung</html>\n200 ');

    expect(body).toBe('<html>Nội dung</html>');
    expect(status).toBe(200);
    expect(next).toBe('');
  });

  it('không nuốt dòng cuối của thân trang khi trang có nhiều dòng trống', () => {
    const { body, status } = splitTrailer('a\n\nb\n\n404 ');

    expect(body).toBe('a\n\nb\n');
    expect(status).toBe(404);
  });

  it('trả trạng thái 0 khi curl không ghi được gì', () => {
    expect(splitTrailer('')).toEqual({ body: '', status: 0, next: '' });
  });
});

describe('pinArgs', () => {
  it('ghim tên miền vào địa chỉ đã kiểm, kèm cổng mặc định của giao thức', () => {
    expect(pinArgs(new URL('https://topcv.vn/viec-lam'), '1.2.3.4')).toEqual([
      '--resolve',
      'topcv.vn:443:1.2.3.4',
    ]);
    expect(pinArgs(new URL('http://x.test/a'), '1.2.3.4')).toEqual([
      '--resolve',
      'x.test:80:1.2.3.4',
    ]);
  });

  it('giữ nguyên cổng khi URL khai rõ', () => {
    expect(pinArgs(new URL('https://x.test:8443/a'), '1.2.3.4')).toEqual([
      '--resolve',
      'x.test:8443:1.2.3.4',
    ]);
  });

  it('bọc ngoặc vuông cho IPv6', () => {
    expect(pinArgs(new URL('https://x.test/a'), '2001:db8::1')).toEqual([
      '--resolve',
      'x.test:443:[2001:db8::1]',
    ]);
  });

  it('không ghim khi host vốn đã là IP', () => {
    expect(pinArgs(new URL('https://1.2.3.4/a'), '1.2.3.4')).toEqual([]);
  });
});
