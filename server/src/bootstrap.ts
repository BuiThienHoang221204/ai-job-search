import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** Cấu hình tầng HTTP dùng chung cho máy chủ thật và cho bộ khung test. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
}
