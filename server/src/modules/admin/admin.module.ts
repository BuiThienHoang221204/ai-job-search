import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import { ReconcileModule } from '../reconcile/reconcile.module.js';
import { ScraperModule } from '../scraper/scraper.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [ScraperModule, ReconcileModule, JobsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
