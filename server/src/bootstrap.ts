import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';

/**
 * Đây là API trả JSON và file, KHÔNG render HTML - nên hai header nổi tiếng
 * nhất của helmet lại không phải phần đáng giá ở đây: CSP và chống clickjacking
 * thuộc về phía Next.js. Thứ thật sự cần là `nosniff`.
 *
 * Vì sao `nosniff` quan trọng với riêng app này: `documents.controller.ts` trả
 * về file người dùng tải lên và file model sinh ra. Thiếu `nosniff`, trình
 * duyệt được phép tự đoán kiểu nội dung, và một file dựng khéo có thể bị đoán
 * thành HTML rồi chạy trong chính origin này - tức stored XSS.
 *
 * `crossOriginResourcePolicy` phải nới thành `cross-origin`: mặc định của
 * helmet là `same-origin`, mà giao diện luôn nằm ở origin khác (CORS_ORIGIN).
 * Để mặc định thì đường TẢI FILE của chính giao diện bị chặn - và nó chỉ hỏng ở
 * nút tải về, không hỏng ở màn hình thường, nên rất khó lần ra.
 */
const HELMET_OPTIONS = {
  crossOriginResourcePolicy: { policy: 'cross-origin' as const },
};

/** Cấu hình tầng HTTP dùng chung cho máy chủ thật và cho bộ khung test. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/docs')) {
      return next();
    }
    return helmet(HELMET_OPTIONS)(req, res, next);
  });
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('AI Job Search API')
    .setDescription('Tài liệu API cho hệ thống Tìm kiếm việc làm AI')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
