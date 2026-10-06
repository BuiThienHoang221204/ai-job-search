import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { QueueModule } from '../queue/queue.module';
import { ReconcileModule } from '../reconcile/reconcile.module';
import { ScraperModule } from '../scraper/scraper.module';
import { AdminJobsController } from './controllers/admin-jobs.controller';
import { AdminScrapeController } from './controllers/admin-scrape.controller';
import { AdminJobsService } from './services/admin-jobs.service';
import { AdminScrapeService } from './services/admin-scrape.service';
import { AdminSkillsController } from './controllers/admin-skills.controller';
import { AdminSkillsService } from './services/admin-skills.service';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminUsersService } from './services/admin-users.service';
import { AdminController } from './controllers/admin.controller';
import { AdminService } from './services/admin.service';

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
