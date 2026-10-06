import { Module } from '@nestjs/common';
import { ReconcileCronService } from './services/reconcile-cron.service';
import { ReconcileService } from './services/reconcile.service';

/** Nhặt lại việc nền đã rơi mất. */
@Module({
  providers: [ReconcileService, ReconcileCronService],
  exports: [ReconcileService],
})
export class ReconcileModule {}
