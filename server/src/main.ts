import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { Server } from 'node:http';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const jwtSecret = config.get<string>('auth.jwtSecret');
  if (!jwtSecret || jwtSecret.startsWith('thay-bang')) {
    // Dừng hẳn thay vì chạy tiếp với khóa mặc định: một JWT_SECRET đoán được
    // nghĩa là bất kỳ ai cũng ký được token cho bất kỳ tài khoản nào.
    throw new Error('JWT_SECRET chưa được đặt. Sinh khóa thật trước khi chạy.');
  }

  // Prefix, cookieParser và ValidationPipe nằm ở bootstrap.ts vì bộ khung test
  // dùng đúng cấu hình đó - xem test/support/app-harness.ts.
  configureApp(app);

  // `credentials: true` là bắt buộc để trình duyệt chịu gửi cookie kèm request
  // sang đây. Đi cùng nó, `origin` KHÔNG được để '*' - trình duyệt từ chối
  // đúng cặp đó, và lỗi hiện ra ở console trình duyệt chứ không ở log máy chủ.
  app.enableCors({
    origin: config.get<string>('corsOrigin'),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = config.get<number>('port')!;
  await app.listen(port);

  // Token đầu tiên từ model có thể mất vài chục giây. Timeout mặc định của
  // Node sẽ cắt stream giữa chừng, nên nới hạn ra cho các endpoint SSE sau
  // này.
  const server = app.getHttpServer() as Server;
  server.setTimeout(300_000);

  logger.log(`API sẵn sàng tại http://localhost:${port}/api`);
}

void bootstrap();
