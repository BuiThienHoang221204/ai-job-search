import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SkillsModule } from '../skills/skills.module';
import { UpskillController } from './upskill.controller';
import { UpskillProcessor } from './upskill.processor';
import { UpskillService } from './upskill.service';

@Module({
  imports: [AiModule, SkillsModule],
  controllers: [UpskillController],
  providers: [UpskillService, UpskillProcessor],
  exports: [UpskillService],
})
export class UpskillModule {}
