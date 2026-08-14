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

/// Nơi đặt những thứ cắt ngang mọi module: filter, middleware, guard,
/// decorator, và các type dùng chung.
///
/// Quy tắc duy nhất của thư mục `common/`: KHÔNG import gì từ `modules/`.
/// Đây là tầng đáy - mọi module dựa vào nó, nó không biết module nào tồn tại.
/// Chiều phụ thuộc một chiều đó là thứ giữ cho `common/` không biến thành nơi
/// mọi thứ dính vào mọi thứ.
///
/// Để đưa được guard xác thực vào đây thì type `AuthUser` phải lên
/// `common/types/` trước: guard và `@CurrentUser` đều cần nó, mà nó vốn nằm
/// trong `modules/auth/jwt.strategy.js`. Giờ `common/` định nghĩa hợp đồng
/// (`AuthUser`, `JwtAuthGuard`, `RolesGuard`, `@Roles`), còn `modules/auth/`
/// giữ phần cài đặt (`JwtStrategy` - provider được AuthModule đăng ký, biết
/// về Prisma và cookie). Phụ thuộc chạy đúng một chiều: auth -> common.
///
/// Filter đăng ký qua APP_FILTER thay vì `app.useGlobalFilters()` trong
/// main.ts: cách này để Nest tự tiêm phụ thuộc, nên filter dùng được
/// ConfigService hay bất kỳ provider nào về sau.
@Module({
  providers: [
    // Thứ tự trong mảng này là thứ tự guard chạy, và throttler PHẢI đứng trước:
    // một kẻ dò mật khẩu nên bị chặn trước khi máy chủ tốn công băm bcrypt 12
    // vòng cho từng lần thử.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Mặc-định-đóng: mọi route đòi token trừ khi có `@Public()`. Thêm
    // controller mới mà quên nghĩ tới xác thực thì route đó đóng chứ không mở.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // '*splat' chứ không phải '*': Express 5 dùng path-to-regexp v8, ở đó '*'
    // trần là lỗi cú pháp ("Missing parameter name") và ứng dụng chết ngay lúc
    // khởi động. Dấu sao phải có tên đi kèm.
    consumer
      .apply(RequestLogMiddleware)
      .forRoutes({ path: '*splat', method: RequestMethod.ALL });
  }
}
