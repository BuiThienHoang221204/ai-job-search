import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaExceptionFilter } from './filters/prisma-exception.filter.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { UserThrottlerGuard } from './guards/user-throttler.guard.js';
import { RequestLogMiddleware } from './middleware/request-log.middleware.js';

/**
 * Nơi đặt những thứ cắt ngang mọi module: filter, middleware, guard,
 * decorator, và các type dùng chung.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Sau JwtAuthGuard để đếm theo tài khoản; route @Public vẫn bị đếm, theo IP.
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    // Toàn cục để `@Roles()` luôn có hiệu lực; phải đứng sau JwtAuthGuard vì cần `request.user`.
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestLogMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
