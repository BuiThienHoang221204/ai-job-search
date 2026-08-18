import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { AtsSourceService } from './services/ats-source.service.js';
import { JobSourceRouter } from './job-source.router.js';
import { PortalCliService } from './services/portal-cli.service.js';
import { ScrapeCronService } from './services/scrape-cron.service.js';
import { ScraperController } from './scraper.controller.js';
import { ScraperProcessor } from './scraper.processor.js';
import { ScraperService } from './services/scraper.service.js';

@Module({
  imports: [AiModule, SkillsModule],
  controllers: [ScraperController],
  providers: [
    ScraperService,
    ScraperProcessor,
    PortalCliService,
    AtsSourceService,
    JobSourceRouter,
    ScrapeCronService,
  ],
  exports: [ScraperService, ScrapeCronService],
})
export class ScraperModule {}
