import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { CompaniesModule } from '@/modules/companies/companies.module';
import { JobsModule } from '@/modules/jobs/jobs.module';
import { MatchingModule } from '@/modules/matching/matching.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { ExtAuthController } from './auth/ext-auth.controller';
import { ExtAuthGuard } from './auth/ext-auth.guard';
import { ExtCompanyController } from './company/ext-company.controller';
import { ExtCompanyService } from './company/ext-company.service';
import { ExtJobsController } from './jobs/ext-jobs.controller';
import { ExtJobsService } from './jobs/ext-jobs.service';
import { ExtMatchController } from './match/ext-match.controller';
import { ExtMatchService } from './match/ext-match.service';
import { ExtProfileController } from './profile/ext-profile.controller';

@Module({
  imports: [
    AuthModule,
    ProfileModule,
    JobsModule,
    MatchingModule,
    CompaniesModule,
  ],
  controllers: [
    ExtAuthController,
    ExtProfileController,
    ExtJobsController,
    ExtMatchController,
    ExtCompanyController,
  ],
  providers: [ExtAuthGuard, ExtJobsService, ExtMatchService, ExtCompanyService],
})
export class ExtModule {}
