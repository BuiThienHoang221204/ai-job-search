import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from '../types/auth-user';

type TrackedRequest = { user?: AuthUser; ip?: string };

export function throttleTracker(req: TrackedRequest): string {
  if (req.user?.id) return `user:${req.user.id}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(throttleTracker(req as TrackedRequest));
  }
}
