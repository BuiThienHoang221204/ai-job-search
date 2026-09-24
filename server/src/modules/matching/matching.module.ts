import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { SemanticModule } from '../semantic/semantic.module.js';
import { MatchingController } from './matching.controller.js';
import { MatchingProcessor } from './matching.processor.js';
import { AiShortlistService } from './rules/services/ai-shortlist.service.js';
import { JobRequirementsService } from './ai/services/job-requirements.service.js';
import { MatchingService } from './ai/services/matching.service.js';
import { RequirementMatchService } from './rules/services/requirement-match.service.js';
import { SkillDictionaryService } from './ai/services/skill-dictionary.service.js';

@Module({
  imports: [AiModule, SkillsModule, SemanticModule],
  controllers: [MatchingController],
  providers: [
    MatchingProcessor,
    MatchingService,
    JobRequirementsService,
    RequirementMatchService,
    SkillDictionaryService,
    AiShortlistService,
  ],
  exports: [
    MatchingService,
    JobRequirementsService,
    RequirementMatchService,
    SkillDictionaryService,
    AiShortlistService,
  ],
})
export class MatchingModule {}
