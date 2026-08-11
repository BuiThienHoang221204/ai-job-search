import type { CookieOptions, Response } from 'express';

export const AUTH_COOKIE = 'aijob_token';

/// Phải khớp JWT_EXPIRES_IN=7d. Cookie sống lâu hơn token thì người dùng thấy
/// mình vẫn "đang đăng nhập" nhưng nhận 401 ở mọi thao tác - trạng thái khó
/// hiểu nhất có thể bày ra cho người dùng.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const options = (): CookieOptions => ({
  /// JavaScript trong trang không đọc được cookie này. Nhờ vậy một lỗi XSS ở
  /// bất kỳ đâu trong giao diện cũng không lấy được token mang đi.
  httpOnly: true,

  /// 'lax' đủ dùng vì frontend và backend luôn cùng site:
  /// - Khi phát triển: localhost:3000 và localhost:4000. Cookie KHÔNG phân
  ///   biệt cổng, chỉ phân biệt tên miền, nên đây là cùng site.
  /// - Khi chạy thật: app.example.com và api.example.com, chung example.com.
  ///
  /// Nếu sau này hai bên nằm ở hai tên miền KHÁC HẲN nhau thì phải đổi sang
  /// 'none' + secure, và lúc đó Safari chặn thẳng còn Chrome đang loại bỏ dần
  /// cookie bên thứ ba. Chọn tên miền con là cách tránh cả mớ rắc rối đó.
  sameSite: 'lax',

  /// Bật secure ở production thôi: trên http://localhost trình duyệt sẽ lặng lẽ
  /// vứt cookie có cờ secure, và đăng nhập trông như hỏng mà không báo gì.
  secure: process.env.NODE_ENV === 'production',

  path: '/',

  /// Cho phép chia sẻ cookie giữa các tên miền con khi chạy thật, ví dụ
  /// COOKIE_DOMAIN=.example.com. Bỏ trống khi phát triển để cookie gắn với
  /// đúng host hiện tại.
  domain: process.env.COOKIE_DOMAIN || undefined,
});

export const setAuthCookie = (response: Response, token: string): void => {
  response.cookie(AUTH_COOKIE, token, { ...options(), maxAge: SEVEN_DAYS_MS });
};

/// Xoá cookie. Phải truyền lại ĐÚNG path và domain như lúc tạo, nếu không
/// trình duyệt coi đây là một cookie khác và cookie cũ vẫn nằm nguyên đó.
export const clearAuthCookie = (response: Response): void => {
  // options() không chứa maxAge - maxAge chỉ được thêm ở setAuthCookie - nên
  // dùng thẳng được, không cần lọc bớt trường nào.
  response.clearCookie(AUTH_COOKIE, options());
};
