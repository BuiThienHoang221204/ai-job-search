import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { SalaryModule } from '../salary/salary.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PublicJobsController } from './public-jobs.controller';
import { TaxonomyBackfillService } from './taxonomy/backfill.service';

@Module({
  imports: [MatchingModule, SalaryModule],
  controllers: [JobsController, PublicJobsController],
  providers: [JobsService, TaxonomyBackfillService],
  exports: [JobsService, TaxonomyBackfillService],
})
export class JobsModule {}
