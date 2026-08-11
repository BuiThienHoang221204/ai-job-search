import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { ApplicationsModule } from './modules/applications/applications.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { InterviewModule } from './modules/interview/interview.module.js';
import { JobsModule } from './modules/jobs/jobs.module.js';
import { UpskillModule } from './modules/upskill/upskill.module.js';
import { MatchingModule } from './modules/matching/matching.module.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { ScraperModule } from './modules/scraper/scraper.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
import { SkillsModule } from './modules/skills/skills.module.js';
import { StorageModule } from './modules/storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // Cung cấp SchedulerRegistry cho ScrapeCronService. Lịch và múi giờ đọc từ
    // cấu hình chứ không khai bằng decorator - xem scrape-cron.service.ts.
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    QueueModule,
    AiModule,
    SkillsModule,
    AuthModule,
    ProfileModule,
    JobsModule,
    ScraperModule,
    MatchingModule,
    InterviewModule,
    UpskillModule,
    DocumentsModule,
    ApplicationsModule,
    DashboardModule,
    AdminModule,
  ],
})
export class AppModule {}
