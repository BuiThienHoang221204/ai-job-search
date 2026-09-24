import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { CommonModule } from 'src/common/common.module.js';
import { Roles } from 'src/common/decorators/roles.decorator.js';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard.js';
import { RolesGuard } from 'src/common/guards/roles.guard.js';

@Roles('ADMIN')
class AdminOnlyController {
  run() {}
}

class OpenController {
  run() {}
  @Roles('ADMIN')
  adminRun() {}
}

function context(
  controller: new () => object,
  handler: string,
  role?: string,
): ExecutionContext {
  return {
    getHandler: () =>
      (controller.prototype as Record<string, unknown>)[handler],
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { id: 'u1', role } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('route không gắn @Roles cho qua, kể cả khi chưa có user (@Public)', () => {
    expect(guard.canActivate(context(OpenController, 'run'))).toBe(true);
  });

  it('USER gọi route @Roles("ADMIN") ở mức method bị 403', () => {
    expect(() =>
      guard.canActivate(context(OpenController, 'adminRun', 'USER')),
    ).toThrow(ForbiddenException);
  });

  it('@Roles ở mức class áp cho mọi method', () => {
    expect(() =>
      guard.canActivate(context(AdminOnlyController, 'run', 'USER')),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(context(AdminOnlyController, 'run', 'ADMIN')),
    ).toBe(true);
  });

  it('thiếu user thì bị 403 chứ không lọt qua', () => {
    expect(() =>
      guard.canActivate(context(OpenController, 'adminRun')),
    ).toThrow(ForbiddenException);
  });

  // Chống tái phát: @Roles từng vô hiệu ở matching.controller vì quên @UseGuards(RolesGuard).
  it('được đăng ký toàn cục và đứng sau JwtAuthGuard', () => {
    const providers = Reflect.getMetadata('providers', CommonModule) as Array<{
      provide?: unknown;
      useClass?: unknown;
    }>;
    const guards = providers
      .filter((p) => p.provide === APP_GUARD)
      .map((p) => p.useClass);

    expect(guards).toContain(RolesGuard);
    expect(guards.indexOf(RolesGuard)).toBeGreaterThan(
      guards.indexOf(JwtAuthGuard),
    );
  });
});
