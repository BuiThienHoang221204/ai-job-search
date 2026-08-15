import { Module } from '@nestjs/common';
import { ReconcileCronService } from './reconcile-cron.service.js';
import { ReconcileService } from './reconcile.service.js';

/** Nhặt lại việc nền đã rơi mất. */
@Module({
  providers: [ReconcileService, ReconcileCronService],
  exports: [ReconcileService],
})
export class ReconcileModule {}
