import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '../../generated/prisma/enums.js';
import type { AuthUser } from './jwt.strategy.js';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/// Chặn route theo vai trò.
///
/// Vai trò đến từ `AuthUser`, mà `JwtStrategy.validate()` đọc tươi từ DB mỗi
/// request - KHÔNG đọc claim trong token. Nếu ghi vai trò vào token, một tài
/// khoản bị hạ quyền vẫn giữ nguyên quyền cũ cho đến khi token hết hạn.
///
/// Phải đặt SAU JwtAuthGuard trong @UseGuards: guard này đọc `request.user`
/// mà guard kia gán vào.
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
