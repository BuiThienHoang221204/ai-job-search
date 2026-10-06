import { Module } from '@nestjs/common';
import { ReconcileCronService } from './services/reconcile-cron.service';
import { ReconcileService } from './services/reconcile.service';

@Module({
  providers: [ReconcileService, ReconcileCronService],
  exports: [ReconcileService],
})
export class ReconcileModule {}
