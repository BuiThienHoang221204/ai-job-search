import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/enums.js';

/**
 * Khoá metadata mà `@Roles()` ghi vào và `RolesGuard` đọc ra. Hai bên phải
 * dùng chung đúng khoá này, nên nó nằm ở đây - cạnh nơi ghi - và guard import
 * sang, thay vì mỗi bên tự khai một chuỗi.
 */
export const ROLES_KEY = 'roles';

/** Giới hạn route theo vai trò; `RolesGuard` là APP_GUARD toàn cục nên không cần `@UseGuards`. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
