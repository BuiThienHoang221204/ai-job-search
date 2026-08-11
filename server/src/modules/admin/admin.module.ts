import { Module } from '@nestjs/common';
import { ScraperModule } from '../scraper/scraper.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  // Cần ScrapeCronService cho route chạy tay lượt quét hằng đêm.
  imports: [ScraperModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
