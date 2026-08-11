import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsProcessor } from './documents.processor.js';
import { DocumentsService } from './documents.service.js';

@Module({
  imports: [AiModule, SkillsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsProcessor],
  exports: [DocumentsService],
})
export class DocumentsModule {}
