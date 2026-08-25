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
    throw new Error('JWT_SECRET chưa được đặt. Sinh khóa thật trước khi chạy.');
  }

  configureApp(app);

  app.enableCors({
    origin: config.get<string>('corsOrigin'),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = config.get<number>('port')!;
  await app.listen(port);

  const server = app.getHttpServer() as Server;
  server.setTimeout(300_000);

  logger.log(`API sẵn sàng tại http://localhost:${port}/api`);
}

void bootstrap();
