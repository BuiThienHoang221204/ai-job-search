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

/// Lỗi Prisma lọt ra tới tầng HTTP thì dịch sang đúng mã trạng thái, thay vì
/// để Nest trả 500 cho mọi trường hợp.
///
/// Đây là LƯỚI AN TOÀN, không phải chỗ xử lý chính. Nơi nào biết lỗi đó nghĩa
/// là gì trong nghiệp vụ thì vẫn bắt tại chỗ và ném thông báo cụ thể - xem
/// `auth.service.ts` (email trùng) và `applications.service.ts` (đơn trùng).
/// Filter này chỉ lo phần còn lại: một câu update trên bản ghi vừa bị xoá
/// đáng ra là 404 chứ không phải "lỗi máy chủ", và người dùng cần biết khác
/// biệt đó để quyết định có thử lại hay không.
///
/// Thông báo trả ra cố tình chung chung. `error.meta` của Prisma chứa tên bảng
/// và tên cột - đủ để dựng lại lược đồ cơ sở dữ liệu từ bên ngoài. Chi tiết đó
/// chỉ đi vào log máy chủ.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  /// Mỗi mã lỗi dựng một HttpException thật thay vì tự viết JSON: nhờ vậy thân
  /// phản hồi khớp từng chữ với các lỗi do controller ném ra, giao diện chỉ cần
  /// một cách đọc lỗi duy nhất.
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
    // Các processor của hàng đợi chạy ngoài ngữ cảnh HTTP: không có response
    // để ghi vào. Ném lại để pg-boss thấy job hỏng và xử lý retry theo cách
    // của nó - nuốt ở đây là mất luôn công việc.
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
      // meta cho biết ràng buộc/cột nào vỡ. Không có nó thì một lỗi P2002 trong
      // log là vô dụng vì bảng nào cũng có thể là thủ phạm.
      JSON.stringify(error.meta ?? {}),
    );

    response.status(status).json(httpError.getResponse());
  }
}
