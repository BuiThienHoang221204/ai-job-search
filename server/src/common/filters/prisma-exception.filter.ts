import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  type ArgumentsHost,
  type ExceptionFilter,
  type HttpException,
} from '@nestjs/common';
import { Catch } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { PRISMA_ERROR } from '../../prisma/prisma-errors.js';

/**
 * Lỗi Prisma lọt ra tới tầng HTTP thì dịch sang đúng mã trạng thái, thay vì
 * để Nest trả 500 cho mọi trường hợp.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  /**
   * Mỗi mã lỗi dựng một HttpException thật thay vì tự viết JSON: nhờ vậy thân
   * phản hồi khớp từng chữ với các lỗi do controller ném ra, giao diện chỉ cần
   * một cách đọc lỗi duy nhất.
   */
  private static readonly byCode: Record<string, () => HttpException> = {
    [PRISMA_ERROR.UNIQUE_VIOLATION]: () =>
      new ConflictException('Dữ liệu đã tồn tại'),
    [PRISMA_ERROR.RECORD_NOT_FOUND]: () =>
      new NotFoundException('Không tìm thấy dữ liệu'),
    [PRISMA_ERROR.FOREIGN_KEY_VIOLATION]: () =>
      new BadRequestException('Dữ liệu tham chiếu không hợp lệ'),
  };

  catch(
    error: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    if (host.getType() !== 'http') throw error;

    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const httpError =
      PrismaExceptionFilter.byCode[error.code]?.() ??
      new InternalServerErrorException();
    const status = httpError.getStatus();

    this.logger.error(
      `${error.code} tại ${request.method} ${request.originalUrl.split('?')[0]} -> ${status}`,
      JSON.stringify(error.meta ?? {}),
    );

    response.status(status).json(httpError.getResponse());
  }
}
