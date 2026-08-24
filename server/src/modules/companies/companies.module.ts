import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { CompanyController } from './company.controller.js';
import { CompanyProcessor } from './company.processor.js';
import { CompanyService } from './company.service.js';
import { ReviewResearchService } from './research/review-research.service.js';

@Module({
  imports: [AiModule],
  controllers: [CompanyController],
  providers: [CompanyService, ReviewResearchService, CompanyProcessor],
  exports: [CompanyService],
})
export class CompaniesModule {}
