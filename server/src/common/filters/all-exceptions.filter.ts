import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { messageOf } from '@/common/error-message';
import { Prisma } from '@/generated/prisma/client';
import {
  classifyFailure,
  ModelUnavailableError,
  type FailureKind,
} from '../ai/failure-kind';
import { PrismaExceptionFilter } from './prisma-exception.filter';

const AI_FAILURE: Record<
  Exclude<FailureKind, 'OTHER'>,
  { status: number; message: string }
> = {
  SCHEMA: {
    status: HttpStatus.BAD_GATEWAY,
    message:
      'AI trả về kết quả không đúng cấu trúc. Hãy thử lại; nếu vẫn lỗi thì báo lại.',
  },
  TIMEOUT: {
    status: HttpStatus.GATEWAY_TIMEOUT,
    message: 'Quá thời gian chờ AI phản hồi. Hãy thử lại sau vài phút.',
  },
  UPSTREAM: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message:
      'Nhà cung cấp AI đang quá tải hoặc đã hết lượt gọi. Hãy thử lại sau vài phút.',
  },
};

const UNEXPECTED_MESSAGE = 'Máy chủ gặp lỗi ngoài dự kiến. Hãy thử lại sau.';

const BODY_TOO_LARGE = 'Nội dung gửi lên quá lớn (tối đa 1MB).';

const BODY_UNREADABLE = 'Nội dung gửi lên không đọc được. Hãy gửi JSON hợp lệ.';

function clientErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number' || status < 400 || status >= 500) return null;
  return status;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly prismaFilter = new PrismaExceptionFilter();

  catch(error: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw error;

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      this.prismaFilter.catch(error, host);
      return;
    }

    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = response.getHeader('x-request-id');
    const route = `${request.method} ${request.originalUrl.split('?')[0]} [${String(requestId)}]`;

    if (response.headersSent) {
      this.logger.error(
        `Lỗi sau khi đã gửi phản hồi tại ${route}: ${messageOf(error)}`,
      );
      response.end();
      return;
    }

    if (error instanceof HttpException) {
      const status = error.getStatus();
      const body = error.getResponse();
      if (typeof body === 'string') {
        response.status(status).json({ statusCode: status, message: body });
        return;
      }
      response.status(status).json(body);
      return;
    }

    const clientStatus = clientErrorStatus(error);
    if (clientStatus) {
      const message = clientStatus === 413 ? BODY_TOO_LARGE : BODY_UNREADABLE;
      response.status(clientStatus).json({ statusCode: clientStatus, message });
      return;
    }

    let failureKind = classifyFailure(error);
    if (error instanceof ModelUnavailableError) failureKind = 'UPSTREAM';

    if (failureKind !== 'OTHER') {
      const { status, message } = AI_FAILURE[failureKind];
      this.logger.error(
        `Lượt AI hỏng (${failureKind}) tại ${route} -> ${status}: ${messageOf(error)}`,
      );
      response
        .status(status)
        .json({ statusCode: status, message, failureKind, requestId });
      return;
    }

    this.logger.error(
      `Lỗi ngoài dự kiến tại ${route}: ${messageOf(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: UNEXPECTED_MESSAGE,
      requestId,
    });
  }
}
