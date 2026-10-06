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
import { Prisma } from '@/generated/prisma/client';
import { PRISMA_ERROR } from '@/prisma/prisma-errors';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

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
