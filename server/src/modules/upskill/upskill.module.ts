import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MatchingModule } from '../matching/matching.module';
import { ProfileModule } from '../profile/profile.module';
import { SkillsModule } from '../skills/skills.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { SkillGapService } from './skill-gap.service';
import { UpskillController } from './upskill.controller';
import { UpskillProcessor } from './upskill.processor';
import { UpskillService } from './upskill.service';

@Module({
  imports: [AiModule, SkillsModule, MatchingModule, ProfileModule],
  controllers: [UpskillController, LearningController],
  providers: [
    UpskillService,
    UpskillProcessor,
    SkillGapService,
    LearningService,
  ],
  exports: [UpskillService, SkillGapService],
})
export class UpskillModule {}
