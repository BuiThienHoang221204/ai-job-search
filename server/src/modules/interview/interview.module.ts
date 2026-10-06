import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SkillsModule } from '../skills/skills.module';
import { InterviewController } from './interview.controller';
import { InterviewProcessor } from './interview.processor';
import { InterviewService } from './interview.service';

@Module({
  imports: [AiModule, SkillsModule],
  controllers: [InterviewController],
  providers: [InterviewService, InterviewProcessor],
})
export class InterviewModule {}
