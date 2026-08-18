import { Module } from '@nestjs/common';
import { ReconcileCronService } from './services/reconcile-cron.service.js';
import { ReconcileService } from './services/reconcile.service.js';

/** Nhặt lại việc nền đã rơi mất. */
@Module({
  providers: [ReconcileService, ReconcileCronService],
  exports: [ReconcileService],
})
export class ReconcileModule {}
