import { Module } from '@nestjs/common';
import { PromptBuilderService } from './services/prompt-builder.service';
import { SkillRegistryService } from './services/skill-registry.service';
import { SkillsController } from './skills.controller';

@Module({
  controllers: [SkillsController],
  providers: [SkillRegistryService, PromptBuilderService],
  exports: [SkillRegistryService, PromptBuilderService],
})
export class SkillsModule {}
