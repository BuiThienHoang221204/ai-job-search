import { SetMetadata } from '@nestjs/common';

/** Khoá metadata mà `@Public()` ghi vào và `JwtAuthGuard` đọc ra. */
export const IS_PUBLIC_KEY = 'isPublic';

/** Mở một route cho người chưa đăng nhập. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
