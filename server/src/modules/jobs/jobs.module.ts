import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { PushModule } from '../push/push.module';
import { SalaryModule } from '../salary/salary.module';
import { JobAlertService } from './job-alert.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PublicJobsController } from './public-jobs.controller';
import { TaxonomyBackfillService } from './taxonomy/backfill.service';

@Module({
  imports: [MatchingModule, SalaryModule, PushModule],
  controllers: [JobsController, PublicJobsController],
  providers: [JobsService, TaxonomyBackfillService, JobAlertService],
  exports: [JobsService, TaxonomyBackfillService],
})
export class JobsModule {}
