import { Module } from '@nestjs/common';
import { PromptBuilderService } from './prompt-builder.service.js';
import { SkillRegistryService } from './skill-registry.service.js';
import { SkillsController } from './skills.controller.js';

@Module({
  controllers: [SkillsController],
  providers: [SkillRegistryService, PromptBuilderService],
  exports: [SkillRegistryService, PromptBuilderService],
})
export class SkillsModule {}
