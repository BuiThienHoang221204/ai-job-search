import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { ReconcileModule } from '../reconcile/reconcile.module.js';
import { ScraperModule } from '../scraper/scraper.module.js';
import { AdminJobsController } from './controllers/admin-jobs.controller.js';
import { AdminScrapeController } from './controllers/admin-scrape.controller.js';
import { AdminJobsService } from './services/admin-jobs.service.js';
import { AdminScrapeService } from './services/admin-scrape.service.js';
import { AdminSkillsController } from './controllers/admin-skills.controller.js';
import { AdminSkillsService } from './services/admin-skills.service.js';
import { AdminUsersController } from './controllers/admin-users.controller.js';
import { AdminUsersService } from './services/admin-users.service.js';
import { AdminController } from './controllers/admin.controller.js';
import { AdminService } from './services/admin.service.js';

@Module({
  imports: [ScraperModule, ReconcileModule, JobsModule, QueueModule],
  controllers: [
    AdminController,
    AdminUsersController,
    AdminJobsController,
    AdminSkillsController,
    AdminScrapeController,
  ],
  providers: [
    AdminService,
    AdminUsersService,
    AdminJobsService,
    AdminSkillsService,
    AdminScrapeService,
  ],
})
export class AdminModule {}
