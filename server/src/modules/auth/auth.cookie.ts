import type { CookieOptions, Response } from 'express';

export const AUTH_COOKIE = 'aijob_token';
export const REFRESH_COOKIE = 'aijob_refresh';
export const SESSION_HINT_COOKIE = 'aijob_session';

/** Giới hạn đúng route đổi token - thiếu tiền tố `/api` (`setGlobalPrefix`) thì trình duyệt lặng lẽ không gửi cookie này. */
const REFRESH_PATH = '/api/auth/refresh';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/** Phải khớp JWT_REFRESH_EXPIRES_IN=7d - cookie sống lâu hơn token thì người dùng thấy "đang đăng nhập" nhưng nhận 401 ở mọi thao tác. */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const options = (): CookieOptions => ({
  httpOnly: true, // JS trong trang không đọc được, nên một lỗi XSS không lấy được token.
  sameSite: 'lax', // Đủ dùng vì frontend/backend luôn cùng site (cookie không phân biệt cổng).
  secure: process.env.NODE_ENV === 'production', // Bật secure trên localhost thì trình duyệt âm thầm vứt cookie.
  path: '/',
  domain: process.env.COOKIE_DOMAIN || undefined, // Vd COOKIE_DOMAIN=.example.com để chia sẻ giữa các subdomain lúc chạy thật.
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

/** Cờ "còn phiên hay không" cho middleware Next đọc - KHÔNG httpOnly, KHÔNG chứa bí mật; hai cookie kia không dùng được ở tầng điều hướng (access chết sau 15 phút, refresh bị khoá path). */
export const setSessionHintCookie = (response: Response): void => {
  response.cookie(SESSION_HINT_COOKIE, '1', {
    ...options(),
    httpOnly: false,
    maxAge: SEVEN_DAYS_MS,
  });
};

/** Xoá cả ba cookie - phải truyền lại ĐÚNG path/domain lúc tạo, nếu không trình duyệt coi là cookie khác và cookie cũ vẫn còn nguyên. */
export const clearAuthCookies = (response: Response): void => {
  response.clearCookie(AUTH_COOKIE, options());
  response.clearCookie(REFRESH_COOKIE, { ...options(), path: REFRESH_PATH });
  response.clearCookie(SESSION_HINT_COOKIE, { ...options(), httpOnly: false });
};
