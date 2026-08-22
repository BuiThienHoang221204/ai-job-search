import type { CookieOptions, Response } from 'express';

export const AUTH_COOKIE = 'aijob_token';
export const REFRESH_COOKIE = 'aijob_refresh';
export const SESSION_HINT_COOKIE = 'aijob_session';

/**
 * Đường dẫn mà cookie refresh được gửi kèm. Hẹp có chủ đích: trình duyệt chỉ
 * đính nó vào ĐÚNG route đổi token, nên bí mật sống lâu nhất trong hệ thống
 * không đi qua mạng ở mọi lời gọi API như access token.
 *
 * Phải có tiền tố `/api` vì `bootstrap.ts` gọi `setGlobalPrefix('api')`. Ghi
 * thiếu tiền tố thì trình duyệt LẶNG LẼ không gửi cookie, và mọi lần refresh
 * trả 401 trong khi cookie vẫn nằm nguyên trong DevTools.
 */
const REFRESH_PATH = '/api/auth/refresh';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/**
 * Phải khớp JWT_REFRESH_EXPIRES_IN=7d. Cookie sống lâu hơn token thì người dùng
 * thấy mình vẫn "đang đăng nhập" nhưng nhận 401 ở mọi thao tác - trạng thái khó
 * hiểu nhất có thể bày ra cho người dùng.
 */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const options = (): CookieOptions => ({
  /**
   * JavaScript trong trang không đọc được cookie này. Nhờ vậy một lỗi XSS ở
   * bất kỳ đâu trong giao diện cũng không lấy được token mang đi.
   */
  httpOnly: true,

  /**
   * 'lax' đủ dùng vì frontend và backend luôn cùng site:
   * - Khi phát triển: localhost:3000 và localhost:4000. Cookie KHÔNG phân
   * biệt cổng, chỉ phân biệt tên miền, nên đây là cùng site.
   */
  sameSite: 'lax',

  /**
   * Bật secure ở production thôi: trên http://localhost trình duyệt sẽ lặng lẽ
   * vứt cookie có cờ secure, và đăng nhập trông như hỏng mà không báo gì.
   */
  secure: process.env.NODE_ENV === 'production',

  path: '/',

  /**
   * Cho phép chia sẻ cookie giữa các tên miền con khi chạy thật, ví dụ
   * COOKIE_DOMAIN=.example.com. Bỏ trống khi phát triển để cookie gắn với
   * đúng host hiện tại.
   */
  domain: process.env.COOKIE_DOMAIN || undefined,
});

export const setAccessCookie = (response: Response, token: string): void => {
  response.cookie(AUTH_COOKIE, token, {
    ...options(),
    maxAge: FIFTEEN_MINUTES_MS,
  });
};

export const setRefreshCookie = (response: Response, token: string): void => {
  response.cookie(REFRESH_COOKIE, token, {
    ...options(),
    path: REFRESH_PATH,
    maxAge: SEVEN_DAYS_MS,
  });
};

/**
 * Cookie "còn phiên hay không" cho middleware của Next đọc. KHÔNG httpOnly và
 * KHÔNG chứa bí mật - giá trị luôn là '1'.
 *
 * Nó tồn tại vì hai cookie kia đều không dùng được ở tầng điều hướng: access
 * chết sau 15 phút nên người đang đăng nhập hợp lệ vẫn bị đá về /login, còn
 * refresh bị giới hạn `path=/api/auth/refresh` nên trình duyệt không gửi kèm
 * khi request một trang của frontend.
 *
 * Giả mạo được cookie này chỉ đổi lấy quyền NHÌN THẤY khung trang rồi nhận 401
 * ở mọi lời gọi dữ liệu - đúng bằng những gì middleware vốn đã bảo vệ, vì nó
 * chưa bao giờ xác thực chữ ký JWT.
 */
export const setSessionHintCookie = (response: Response): void => {
  response.cookie(SESSION_HINT_COOKIE, '1', {
    ...options(),
    httpOnly: false,
    maxAge: SEVEN_DAYS_MS,
  });
};

/**
 * Xoá cả ba cookie. Phải truyền lại ĐÚNG path và domain như lúc tạo, nếu không
 * trình duyệt coi đây là một cookie khác và cookie cũ vẫn nằm nguyên đó - đây
 * chính là lý do cookie refresh phải xoá kèm `path: REFRESH_PATH`.
 */
export const clearAuthCookies = (response: Response): void => {
  response.clearCookie(AUTH_COOKIE, options());
  response.clearCookie(REFRESH_COOKIE, { ...options(), path: REFRESH_PATH });
  response.clearCookie(SESSION_HINT_COOKIE, { ...options(), httpOnly: false });
};
