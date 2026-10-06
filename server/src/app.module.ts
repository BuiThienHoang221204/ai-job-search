import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { MockInterviewModule } from './modules/mock-interview/mock-interview.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SalaryModule } from './modules/salary/salary.module';
import { QuestionBankModule } from './modules/question-bank/question-bank.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthModule } from './modules/health/health.module';
import { InterviewModule } from './modules/interview/interview.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { UpskillModule } from './modules/upskill/upskill.module';
import { MatchingModule } from './modules/matching/matching.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ProfileSourcesModule } from './modules/profile-sources/profile-sources.module';
import { ReconcileModule } from './modules/reconcile/reconcile.module';
import { ScraperModule } from './modules/scraper/scraper.module';
import { QueueModule } from './modules/queue/queue.module';
import { SkillsModule } from './modules/skills/skills.module';
import { StorageModule } from './modules/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttlMs')!,
            limit: config.get<number>('throttle.limit')!,
          },
        ],
        skipIf: () => config.get<boolean>('throttle.disabled') === true,
      }),
    }),
    CommonModule,
    PrismaModule,
    HealthModule,
    StorageModule,
    QueueModule,
    AiModule,
    SkillsModule,
    AuthModule,
    ProfileModule,
    ProfileSourcesModule,
    JobsModule,
    ScraperModule,
    MatchingModule,
    InterviewModule,
    UpskillModule,
    CompaniesModule,
    DocumentsModule,
    ApplicationsModule,
    MockInterviewModule,
    DashboardModule,
    SalaryModule,
    QuestionBankModule,
    ReconcileModule,
    AdminModule,
  ],
})
export class AppModule {}
