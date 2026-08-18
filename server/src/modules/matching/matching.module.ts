import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { JobRequirementsProcessor } from './processors/job-requirements.processor.js';
import { JobRequirementsService } from './services/job-requirements.service.js';
import { MatchingController } from './matching.controller.js';
import { MatchingProcessor } from './processors/matching.processor.js';
import { MatchingService } from './services/matching.service.js';

@Module({
  imports: [AiModule, SkillsModule],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    MatchingProcessor,
    JobRequirementsService,
    JobRequirementsProcessor,
  ],
  exports: [MatchingService, JobRequirementsService],
})
export class MatchingModule {}
