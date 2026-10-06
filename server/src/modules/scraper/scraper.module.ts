import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SkillsModule } from '../skills/skills.module';
import { JobSourceRouter } from './services/job-source.router';
import { PortalCliService } from './services/portal-cli.service';
import { ScrapeCronService } from './services/scrape-cron.service';
import { ScraperController } from './scraper.controller';
import { ScraperProcessor } from './scraper.processor';
import { ScraperService } from './services/scraper.service';

@Module({
  imports: [AiModule, SkillsModule],
  controllers: [ScraperController],
  providers: [
    ScraperService,
    ScraperProcessor,
    PortalCliService,
    JobSourceRouter,
    ScrapeCronService,
  ],
  exports: [ScraperService, ScrapeCronService, JobSourceRouter],
})
export class ScraperModule {}
