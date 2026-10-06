import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SkillsModule } from '../skills/skills.module';
import { SemanticModule } from '../semantic/semantic.module';
import { MatchingController } from './matching.controller';
import { MatchingProcessor } from './matching.processor';
import { AiShortlistService } from './rules/services/ai-shortlist.service';
import { JobRequirementsService } from './ai/services/job-requirements.service';
import { MatchingService } from './ai/services/matching.service';
import { RequirementMatchService } from './rules/services/requirement-match.service';
import { SkillDictionaryService } from './ai/services/skill-dictionary.service';

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
