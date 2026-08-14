import { Module } from '@nestjs/common';
import { ReconcileModule } from '../reconcile/reconcile.module.js';
import { ScraperModule } from '../scraper/scraper.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  // Cần ScrapeCronService cho route chạy tay lượt quét hằng đêm, và
  // ReconcileService cho route nhặt việc rơi ngay.
  imports: [ScraperModule, ReconcileModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
