import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { InterviewController } from './interview.controller.js';
import { InterviewProcessor } from './interview.processor.js';
import { InterviewService } from './interview.service.js';

@Module({
  imports: [AiModule, SkillsModule],
  controllers: [InterviewController],
  providers: [InterviewService, InterviewProcessor],
  exports: [InterviewService],
})
export class InterviewModule {}
