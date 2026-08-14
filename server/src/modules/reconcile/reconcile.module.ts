import { Module } from '@nestjs/common';
import { ReconcileCronService } from './reconcile-cron.service.js';
import { ReconcileService } from './reconcile.service.js';

/// Nhặt lại việc nền đã rơi mất.
///
/// Không import module nào khác. Nó chỉ cần `PrismaService` (module toàn cục) và
/// `QueueService`, rồi đọc trạng thái trong database và xếp lại vào hàng đợi -
/// documents và matching không cần biết gì về nó, và nó không cần biết gì về cách
/// hai bên kia làm việc. Ranh giới hẹp đó là lý do nó đứng riêng được thay vì phải
/// nhét vào một trong hai module.
///
/// Ngưỡng `STALE_RUNNING_MS` lấy từ matching bằng import TypeScript thường, không
/// qua DI: đó là một hằng số, không phải provider.
@Module({
  providers: [ReconcileService, ReconcileCronService],
  exports: [ReconcileService],
})
export class ReconcileModule {}
