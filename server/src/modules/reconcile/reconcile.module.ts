import { Module } from '@nestjs/common';
import { ReconcileCronService } from './services/reconcile-cron.service';
import { ReconcileService } from './services/reconcile.service';
import { RetentionService } from './services/retention.service';

@Module({
  providers: [ReconcileService, ReconcileCronService, RetentionService],
  exports: [ReconcileService],
})
export class ReconcileModule {}
