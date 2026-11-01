import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser } from '@/common/types/auth-user';
import { isExtPayload } from '@/modules/auth/jwt-payload';
import { resolveAuthUser } from '@/modules/auth/resolve-user';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class ExtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthUser }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException();

    let payload: unknown;
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (!isExtPayload(payload)) throw new UnauthorizedException();

    const user = await resolveAuthUser(this.prisma, payload.sub, payload.ver);
    if (!user) throw new UnauthorizedException();

    request.user = user;
    return true;
  }
}
