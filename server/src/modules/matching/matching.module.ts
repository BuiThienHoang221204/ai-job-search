import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { SemanticModule } from '../semantic/semantic.module.js';
import { JobRequirementsProcessor } from './processors/job-requirements.processor.js';
import { JobRequirementsService } from './services/job-requirements.service.js';
import { MatchingController } from './matching.controller.js';
import { MatchingProcessor } from './processors/matching.processor.js';
import { MatchingService } from './services/matching.service.js';
import { RequirementMatchProcessor } from './processors/requirement-match.processor.js';
import { RequirementMatchService } from './services/requirement-match.service.js';
import { SkillDictionaryService } from './services/skill-dictionary.service.js';
import { SkillCanonicalizeProcessor } from './processors/skill-canonicalize.processor.js';

@Module({
  imports: [AiModule, SkillsModule, SemanticModule],
  controllers: [MatchingController],
  providers: [
    MatchingService,
    MatchingProcessor,
    JobRequirementsService,
    JobRequirementsProcessor,
    RequirementMatchService,
    RequirementMatchProcessor,
    SkillDictionaryService,
    SkillCanonicalizeProcessor,
  ],
  exports: [
    MatchingService,
    JobRequirementsService,
    RequirementMatchService,
    SkillDictionaryService,
  ],
})
export class MatchingModule {}
