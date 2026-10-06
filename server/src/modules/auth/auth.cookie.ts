import type { CookieOptions, Response } from 'express';
import { DAY_MS } from '@/common/duration';

export const AUTH_COOKIE = 'aijob_token';
export const REFRESH_COOKIE = 'aijob_refresh';

const REFRESH_PATH = '/api/auth/refresh';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const SEVEN_DAYS_MS = 7 * DAY_MS;

const options = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
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

export const clearAuthCookies = (response: Response): void => {
  response.clearCookie(AUTH_COOKIE, options());
  response.clearCookie(REFRESH_COOKIE, { ...options(), path: REFRESH_PATH });
};
