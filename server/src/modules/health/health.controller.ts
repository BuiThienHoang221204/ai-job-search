import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { HealthService, type ReadinessReport } from './health.service.js';

/// Hai probe cho orchestrator, và chúng trả lời HAI câu hỏi khác nhau.
///
/// Trộn hai câu hỏi này là lỗi thường gặp và tốn kém: nếu liveness cũng kiểm tra
/// database thì một lần database chập chờn sẽ khiến orchestrator giết và khởi động
/// lại toàn bộ container đang hoàn toàn khoẻ mạnh - làm sự cố nặng thêm đúng lúc
/// hệ thống yếu nhất, thay vì chỉ ngừng đưa request tới.
///
/// - `/api/health` (liveness): tiến trình còn trả lời được không? Nếu KHÔNG thì
///   khởi động lại là đúng. Không kiểm tra phụ thuộc nào.
/// - `/api/ready` (readiness): có nhận việc được không? Nếu KHÔNG thì rút khỏi
///   load balancer nhưng ĐỪNG khởi động lại - chờ phụ thuộc hồi phục.
///
/// Cả hai `@Public()`: load balancer không đăng nhập được.
///
/// Và cả hai `@SkipThrottle()`: orchestrator hỏi đều đặn từ MỘT địa chỉ, nên trần
/// theo IP sẽ chặn đúng nó trước tiên. Một probe bị 429 trông y hệt một probe
/// hỏng — orchestrator sẽ khởi động lại container hoàn toàn khoẻ mạnh.
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('health')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (!report.ready) {
      // 503 chứ không phải 200 kèm cờ: orchestrator đọc mã trạng thái, không đọc
      // thân phản hồi. Trả 200 nghĩa là nó sẽ tiếp tục đẩy request vào một instance
      // không phục vụ được.
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
