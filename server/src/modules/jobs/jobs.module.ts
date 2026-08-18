import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { TaxonomyBackfillService } from './taxonomy/backfill.service.js';

@Module({
  controllers: [JobsController],
  providers: [JobsService, TaxonomyBackfillService],
  exports: [JobsService, TaxonomyBackfillService],
})
export class JobsModule {}
