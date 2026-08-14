import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/// Quá ngưỡng này thì dòng log lên mức warn.
///
/// 1 giây là rộng rãi với ứng dụng này: mọi việc nặng (gọi model, chạy CLI cào
/// tin) đều đẩy sang hàng đợi, nên handler HTTP chỉ đọc/ghi Postgres. Một
/// request vượt 1 giây gần như chắc chắn là truy vấn thiếu index hoặc vòng lặp
/// N+1 - thứ chỉ lộ ra khi dữ liệu đủ lớn, tức là lúc đã chạy thật.
///
/// Nếu sau này có endpoint SSE stream thẳng từ model, phải loại nó ra khỏi
/// ngưỡng này chứ đừng nới ngưỡng lên - nới là mất luôn tác dụng cảnh báo.
const SLOW_REQUEST_MS = 1_000;

/// Ghi một dòng cho mỗi request: phương thức, đường dẫn, mã trạng thái, thời
/// gian. Nest không tự làm việc này.
///
/// Là MIDDLEWARE chứ không phải interceptor, và đây là điểm mấu chốt: guard
/// chạy TRƯỚC interceptor, nên một interceptor không bao giờ nhìn thấy request
/// bị `JwtAuthGuard` chặn. Đã đo trực tiếp - `GET /api/jobs` không kèm cookie
/// trả 401 mà không để lại dòng log nào. Mà 401 hàng loạt chính là thứ đầu
/// tiên cần thấy khi có người dò mật khẩu. Middleware nằm ngoài cùng nên bắt
/// được cả 401 của guard lẫn 404 của đường dẫn không tồn tại.
///
/// Ghi vào lúc `finish` của response thay vì ngay khi vào: chỉ tới lúc đó mới
/// biết mã trạng thái thật, kể cả khi exception filter đã đổi nó.
///
/// Cố ý KHÔNG ghi body, header hay query string. Body có mật khẩu lúc đăng ký
/// và đăng nhập, header có cookie mang token, còn query string là nơi token
/// hay bị nhét vào ở các luồng thêm sau. Log thường được gom về nơi nhiều
/// người đọc được hơn cơ sở dữ liệu, nên thứ gì vào log là coi như đã rời khỏi
/// vòng bảo vệ.
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    const method = request.method;
    // Cắt phần sau dấu '?': xem ghi chú về query string ở trên.
    const path = request.originalUrl.split('?')[0];

    response.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const status = response.statusCode;
      const line = `${method} ${path} ${status} ${ms.toFixed(0)}ms`;

      // 5xx là lỗi của chính máy chủ này. 4xx chỉ là warn: phần lớn do người
      // dùng gửi sai, không có gì để sửa trong code - nhưng vẫn phải thấy
      // được vì một chuỗi 401 liên tiếp là dấu hiệu bị dò mật khẩu.
      if (status >= 500) this.logger.error(line);
      else if (ms >= SLOW_REQUEST_MS) this.logger.warn(`${line} (chậm)`);
      else if (status >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
