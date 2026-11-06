import { Module } from '@nestjs/common';
import { AiModule } from '@/modules/ai/ai.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { CompaniesModule } from '@/modules/companies/companies.module';
import { JobsModule } from '@/modules/jobs/jobs.module';
import { MatchingModule } from '@/modules/matching/matching.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { ExtAuthController } from './auth/ext-auth.controller';
import { ExtAuthGuard } from './auth/ext-auth.guard';
import { ExtAutofillController } from './autofill/ext-autofill.controller';
import { ExtAutofillService } from './autofill/ext-autofill.service';
import { ExtCompanyController } from './company/ext-company.controller';
import { ExtCompanyService } from './company/ext-company.service';
import { ExtInsightsService } from './insights/ext-insights.service';
import { ExtJobsController } from './jobs/ext-jobs.controller';
import { ExtJobsService } from './jobs/ext-jobs.service';
import { ExtLookupController } from './lookup/ext-lookup.controller';
import { ExtLookupService } from './lookup/ext-lookup.service';
import { ExtMatchController } from './match/ext-match.controller';
import { ExtMatchService } from './match/ext-match.service';
import { ExtProfileController } from './profile/ext-profile.controller';
import { ExtProfileService } from './profile/ext-profile.service';
import { ExtUpskillController } from './upskill/ext-upskill.controller';
import { ExtUpskillService } from './upskill/ext-upskill.service';

@Module({
  imports: [
    AuthModule,
    ProfileModule,
    JobsModule,
    MatchingModule,
    CompaniesModule,
    AiModule,
  ],
  controllers: [
    ExtAuthController,
    ExtProfileController,
    ExtJobsController,
    ExtMatchController,
    ExtCompanyController,
    ExtAutofillController,
    ExtUpskillController,
    ExtLookupController,
  ],
  providers: [
    ExtAuthGuard,
    ExtJobsService,
    ExtMatchService,
    ExtCompanyService,
    ExtProfileService,
    ExtAutofillService,
    ExtUpskillService,
    ExtLookupService,
    ExtInsightsService,
  ],
})
export class ExtModule {}
