import { Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * Guard xác thực mặc định của toàn ứng dụng - `CommonModule` đăng ký nó qua
 * APP_GUARD, nên KHÔNG cần (và không nên) gắn `@UseGuards(JwtAuthGuard)` ở
 * từng controller nữa. Gắn lại chỉ khiến người đọc tưởng những controller
 */
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
}
