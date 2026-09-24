import { throttleTracker } from 'src/common/guards/user-throttler.guard.js';

describe('throttleTracker', () => {
  test('đã đăng nhập thì đếm theo tài khoản, không theo IP', () => {
    const user = { id: 'u1', email: 'a@b.c', name: 'A', role: 'USER' as const };

    expect(throttleTracker({ user, ip: '1.1.1.1' })).toBe('user:u1');
    expect(throttleTracker({ user, ip: '2.2.2.2' })).toBe('user:u1');
  });

  test('chưa đăng nhập thì đếm theo IP', () => {
    expect(throttleTracker({ ip: '1.1.1.1' })).toBe('ip:1.1.1.1');
  });

  test('khoá user và khoá IP không bao giờ trùng nhau', () => {
    const user = {
      id: '1.1.1.1',
      email: 'a@b.c',
      name: 'A',
      role: 'USER' as const,
    };

    expect(throttleTracker({ user })).not.toBe(
      throttleTracker({ ip: '1.1.1.1' }),
    );
  });
});
