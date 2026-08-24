import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { TaxonomyBackfillService } from './taxonomy/backfill.service.js';

@Module({
  imports: [MatchingModule],
  controllers: [JobsController],
  providers: [JobsService, TaxonomyBackfillService],
  exports: [JobsService, TaxonomyBackfillService],
})
export class JobsModule {}
