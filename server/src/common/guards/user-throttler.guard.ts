import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from '../types/auth-user.js';

type TrackedRequest = { user?: AuthUser; ip?: string };

// Đã đăng nhập thì đếm theo tài khoản: đổi IP không thoát được trần, và mọi người dùng sau cùng một proxy không chia chung một trần.
export function throttleTracker(req: TrackedRequest): string {
  if (req.user?.id) return `user:${req.user.id}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

/** ThrottlerGuard đếm theo người dùng; phải đứng SAU JwtAuthGuard để `request.user` đã có. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(throttleTracker(req as TrackedRequest));
  }
}
