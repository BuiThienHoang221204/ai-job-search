import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CompanyController } from './company.controller';
import { CompanyProcessor } from './company.processor';
import { CompanyFollowService } from './services/company-follow.service';
import { CompanyService } from './services/company.service';
import { ReviewResearchService } from './services/review-research.service';

@Module({
  imports: [AiModule],
  controllers: [CompanyController],
  providers: [
    CompanyService,
    CompanyFollowService,
    ReviewResearchService,
    CompanyProcessor,
  ],
  exports: [CompanyService],
})
export class CompaniesModule {}
