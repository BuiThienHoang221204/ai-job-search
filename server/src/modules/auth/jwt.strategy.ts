import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AUTH_COOKIE } from './auth.cookie.js';

import type { UserRole } from '../../generated/prisma/enums.js';

export type JwtPayload = { sub: string; email: string };

/// `role` CÓ TÍNH toán từ DB mỗi request, không lấy từ claim trong token.
/// Ghi vai trò vào token nghĩa là một tài khoản bị hạ quyền vẫn giữ quyền cũ
/// cho đến khi token hết hạn.
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

/// Lấy token từ cookie httpOnly. Cần `cookieParser()` đã chạy ở main.ts,
/// không thì `request.cookies` là undefined và mọi request đều 401.
/// Thu hẹp kiểu từng bước thay vì ép kiểu: @types/cookie-parser khai
/// `request.cookies` là `any`, nên một phép ép kiểu sẽ lặng lẽ trả về `any` và
/// mất hết kiểm tra. Cách này còn chịu được trường hợp cookieParser() chưa
/// chạy - trả null thay vì ném lỗi.
const fromCookie = (request: Request): string | null => {
  const cookies: unknown = (request as { cookies?: unknown }).cookies;
  if (typeof cookies !== 'object' || cookies === null) return null;
  const token = (cookies as Record<string, unknown>)[AUTH_COOKIE];
  return typeof token === 'string' ? token : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      /// Cookie được xét TRƯỚC. Giao diện web dùng cookie; Bearer giữ lại cho
      /// script, bài kiểm thử và ứng dụng di động sau này. Bỏ Bearer đi thì mọi
      /// công cụ dòng lệnh gọi API đều phải mô phỏng cookie.
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwtSecret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true },
    });
    // Token còn hạn nhưng tài khoản đã bị xóa.
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
