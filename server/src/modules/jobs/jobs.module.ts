import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { SalaryModule } from '../salary/salary.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { TaxonomyBackfillService } from './taxonomy/backfill.service';

@Module({
  imports: [MatchingModule, SalaryModule],
  controllers: [JobsController],
  providers: [JobsService, TaxonomyBackfillService],
  exports: [JobsService, TaxonomyBackfillService],
})
export class JobsModule {}
