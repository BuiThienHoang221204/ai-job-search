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

/// Chặn route theo vai trò. Đi cặp với decorator `@Roles()`.
///
/// Vai trò đến từ `AuthUser`, mà `JwtStrategy.validate()` đọc tươi từ DB mỗi
/// request - KHÔNG đọc claim trong token. Nếu ghi vai trò vào token, một tài
/// khoản bị hạ quyền vẫn giữ nguyên quyền cũ cho đến khi token hết hạn.
///
/// Không cần khai `JwtAuthGuard` kèm theo: nó là APP_GUARD toàn cục, mà guard
/// toàn cục luôn chạy trước guard của controller, nên `request.user` chắc chắn
/// đã được gắn khi tới đây.
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
      // Không tiết lộ route này đòi vai trò gì.
      throw new ForbiddenException('Không có quyền truy cập');
    }
    return true;
  }
}
