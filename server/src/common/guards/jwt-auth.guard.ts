import {
  Injectable,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export const UNAUTHORIZED_MESSAGE =
  'Bạn cần đăng nhập để tiếp tục, hoặc phiên đăng nhập đã hết hạn.';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser>(error: Error | null, user: TUser | false): TUser {
    if (error && !(error instanceof UnauthorizedException)) throw error;
    if (error || !user) throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    return user;
  }
}
