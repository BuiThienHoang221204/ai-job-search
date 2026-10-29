import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { vietnameseValidationError } from './common/validation-message';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

const VALID_REQUEST_ID = /^[\w-]{1,64}$/;

const HELMET_OPTIONS = {
  crossOriginResourcePolicy: { policy: 'cross-origin' as const },
};

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  (app.getHttpAdapter().getInstance() as Express).disable('x-powered-by');

  app.use(express.json({ strict: false, limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header(REQUEST_ID_HEADER);
    const id =
      incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      process.env.NODE_ENV !== 'production' &&
      req.path.startsWith('/api/docs')
    ) {
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
      exceptionFactory: vietnameseValidationError,
    }),
  );

  if (process.env.NODE_ENV === 'production') return;

  const config = new DocumentBuilder()
    .setTitle('AI Job Search API')
    .setDescription('Tài liệu API cho hệ thống Tìm kiếm việc làm AI')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
