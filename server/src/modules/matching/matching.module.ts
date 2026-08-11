import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { MatchingController } from './matching.controller.js';
import { MatchingProcessor } from './matching.processor.js';
import { MatchingService } from './matching.service.js';

@Module({
  imports: [AiModule, SkillsModule],
  controllers: [MatchingController],
  providers: [MatchingService, MatchingProcessor],
  exports: [MatchingService],
})
export class MatchingModule {}
