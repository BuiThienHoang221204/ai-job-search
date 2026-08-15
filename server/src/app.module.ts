import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module.js';
import configuration from './config/configuration.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { ApplicationsModule } from './modules/applications/applications.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { ApplyModule } from './modules/apply/apply.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { InterviewModule } from './modules/interview/interview.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { UpskillModule } from './modules/upskill/upskill.module.js';
import { MatchingModule } from './modules/matching/matching.module.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { ProfileSourcesModule } from './modules/profile-sources/profile-sources.module.js';
import { ReconcileModule } from './modules/reconcile/reconcile.module.js';
import { ScraperModule } from './modules/scraper/scraper.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
import { SkillsModule } from './modules/skills/skills.module.js';
import { StorageModule } from './modules/storage/storage.module.js';

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
    ApplyModule,
    DocumentsModule,
    ApplicationsModule,
    DashboardModule,
    ReconcileModule,
    AdminModule,
  ],
})
export class AppModule {}
