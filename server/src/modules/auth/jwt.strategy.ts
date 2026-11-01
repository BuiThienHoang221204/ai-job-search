import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/prisma/prisma.service';
import { AUTH_COOKIE } from './auth.cookie';
import { isAccessPayload } from './jwt-payload';
import { resolveAuthUser } from './resolve-user';

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
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwtSecret')!,
    });
  }

  async validate(payload: unknown): Promise<AuthUser> {
    if (!isAccessPayload(payload)) throw new UnauthorizedException();
    const user = await resolveAuthUser(this.prisma, payload.sub, payload.ver);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
