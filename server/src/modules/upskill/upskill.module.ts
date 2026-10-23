import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MatchingModule } from '../matching/matching.module';
import { ProfileModule } from '../profile/profile.module';
import { PushModule } from '../push/push.module';
import { SkillsModule } from '../skills/skills.module';
import { LearningController } from './learning.controller';
import { LearningService } from './services/learning.service';
import { SkillGapService } from './services/skill-gap.service';
import { StudyReminderService } from './services/study-reminder.service';
import { UpskillController } from './upskill.controller';
import { UpskillProcessor } from './upskill.processor';
import { UpskillService } from './services/upskill.service';

@Module({
  imports: [AiModule, SkillsModule, MatchingModule, ProfileModule, PushModule],
  controllers: [UpskillController, LearningController],
  providers: [
    UpskillService,
    UpskillProcessor,
    SkillGapService,
    LearningService,
    StudyReminderService,
  ],
  exports: [UpskillService, SkillGapService],
})
export class UpskillModule {}
