import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { PortalCliService } from './portal-cli.service.js';
import { ScrapeCronService } from './scrape-cron.service.js';
import { ScraperController } from './scraper.controller.js';
import { ScraperProcessor } from './scraper.processor.js';
import { ScraperService } from './scraper.service.js';

@Module({
  imports: [AiModule, SkillsModule],
  controllers: [ScraperController],
  providers: [
    ScraperService,
    ScraperProcessor,
    PortalCliService,
    ScrapeCronService,
  ],
  exports: [ScraperService, ScrapeCronService],
})
export class ScraperModule {}
