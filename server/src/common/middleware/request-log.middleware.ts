import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** Quá ngưỡng này thì dòng log lên mức warn. */
const SLOW_REQUEST_MS = 1_000;

/**
 * Ghi một dòng cho mỗi request: phương thức, đường dẫn, mã trạng thái, thời
 * gian. Nest không tự làm việc này.
 */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    const method = request.method;
    const path = request.originalUrl.split('?')[0];

    response.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const status = response.statusCode;
      const line = `${method} ${path} ${status} ${ms.toFixed(0)}ms`;

      if (status >= 500) this.logger.error(line);
      else if (ms >= SLOW_REQUEST_MS) this.logger.warn(`${line} (chậm)`);
      else if (status >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
