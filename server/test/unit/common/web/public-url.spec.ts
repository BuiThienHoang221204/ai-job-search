import {
  isBlockedAddress,
  resolvePublicUrl,
} from 'src/common/web/public-url.js';

describe('isBlockedAddress', () => {
  test.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.5',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '198.18.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
  ])('chặn IPv4 nội bộ %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  // Bản cũ chỉ so tiền tố chuỗi nên các dạng này lọt: IPv4 nội bộ bọc trong IPv6 vẫn tới được máy chủ dual-stack.
  test.each([
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:7f00:1',
    '::ffff:a00:1',
    '64:ff9b::a9fe:a9fe',
    '::127.0.0.1',
    '2002:7f00:1::',
    'fec0::1',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '[::1]',
  ])('chặn IPv6 trỏ vào mạng nội bộ %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  test.each([
    '8.8.8.8',
    '104.16.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('cho qua địa chỉ công khai %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  test('chuỗi không phải IP thì chặn', () => {
    expect(isBlockedAddress('localhost')).toBe(true);
  });
});

describe('resolvePublicUrl', () => {
  test.each([
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:169.254.169.254]/latest/meta-data/',
  ])('từ chối URL IP nội bộ %s', async (raw) => {
    await expect(resolvePublicUrl(raw)).rejects.toThrow('mạng nội bộ');
  });

  test('từ chối giao thức khác http/https', async () => {
    await expect(resolvePublicUrl('file:///etc/passwd')).rejects.toThrow(
      'Chỉ hỗ trợ http và https',
    );
  });
});
