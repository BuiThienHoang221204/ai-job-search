import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { UpskillController } from './upskill.controller.js';
import { UpskillProcessor } from './upskill.processor.js';
import { UpskillService } from './upskill.service.js';

@Module({
  imports: [AiModule, SkillsModule],
  controllers: [UpskillController],
  providers: [UpskillService, UpskillProcessor],
  exports: [UpskillService],
})
export class UpskillModule {}
