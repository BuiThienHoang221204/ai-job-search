import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/// Cấu hình tầng HTTP dùng chung cho máy chủ thật và cho bộ khung test.
///
/// Tách ra khỏi `main.ts` để hai bên KHÔNG THỂ lệch nhau. Một `ValidationPipe`
/// chỉ có ở production nghĩa là test xanh với dữ liệu mà production từ chối -
/// và đó là loại sai lệch không ai phát hiện cho tới lúc deploy.
///
/// Chỉ đặt ở đây những thứ định hình *hợp đồng HTTP*. Những thứ chỉ máy chủ
/// thật cần - CORS, `listen`, hạn thời gian của socket, kiểm tra JWT_SECRET -
/// vẫn nằm ở `main.ts`: test không mở cổng nào và không gọi qua trình duyệt.
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');

  // Phải chạy TRƯỚC mọi guard: JwtStrategy đọc token từ request.cookies, mà
  // thuộc tính đó do chính middleware này gắn vào.
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
}
