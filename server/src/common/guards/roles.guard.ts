import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '../../generated/prisma/enums.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { AuthUser } from '../types/auth-user.js';

/** Chặn route theo vai trò. Đi cặp với decorator `@Roles()`. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const role = request.user?.role;

    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Không có quyền truy cập');
    }
    return true;
  }
}
