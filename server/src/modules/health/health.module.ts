import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/**
 * Probe cho orchestrator.
 *
 * Kiểm database và hàng đợi — hai thứ mà thiếu chúng thì không tính năng nào chạy —
 * cộng thêm môi trường tạo PDF.
 *
 * `DocumentsModule` là phụ thuộc DUY NHẤT vào một module tính năng, và nó có giá:
 * health giờ biết tới documents. Đổi lại, một máy chủ không tạo được PDF sẽ hiện ra ở
 * `/ready` thay vì im lặng cho tới khi người dùng đầu tiên bấm nút. `latex` cố ý
 * KHÔNG tính vào `ready` (xem `ReadinessReport`), nên nó không làm orchestrator khởi
 * động lại app vì một tính năng phụ.
 *
 * Nếu sau này có thêm phụ thuộc kiểu này, hãy đảo chiều: cho mỗi module tự đăng ký
 * một phép kiểm vào một registry, thay vì để health import từng module.
 */
@Module({
  imports: [DocumentsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
