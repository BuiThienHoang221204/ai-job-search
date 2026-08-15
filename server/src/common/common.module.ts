import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrismaExceptionFilter } from './filters/prisma-exception.filter.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RequestLogMiddleware } from './middleware/request-log.middleware.js';

/**
 * Nơi đặt những thứ cắt ngang mọi module: filter, middleware, guard,
 * decorator, và các type dùng chung.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
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
