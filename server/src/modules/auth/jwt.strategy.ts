import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/prisma/prisma.service';
import { AUTH_COOKIE } from './auth.cookie';
import { isAccessPayload } from './jwt-payload';

export type { JwtPayload } from './jwt-payload';

/**
 * Lấy token từ cookie httpOnly. Cần `cookieParser()` đã chạy ở main.ts,
 * không thì `request.cookies` là undefined và mọi request đều 401.
 * Thu hẹp kiểu từng bước thay vì ép kiểu: @types/cookie-parser khai
 */
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
      /**
       * Cookie được xét TRƯỚC. Giao diện web dùng cookie; Bearer giữ lại cho
       * script, bài kiểm thử và ứng dụng di động sau này. Bỏ Bearer đi thì mọi
       * công cụ dòng lệnh gọi API đều phải mô phỏng cookie.
       */
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwtSecret')!,
    });
  }

  /** Ngoài chữ ký còn phải đúng `typ==='access'` (chặn refresh token làm Bearer) và `ver===tokenVersion` (điểm thu hồi). */
  async validate(payload: unknown): Promise<AuthUser> {
    if (!isAccessPayload(payload)) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tokenVersion: true,
      },
    });
    if (!user || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
