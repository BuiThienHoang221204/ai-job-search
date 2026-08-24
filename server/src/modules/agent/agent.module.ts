import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AgentContextService } from './services/agent-context.service.js';
import { AgentController } from './agent.controller.js';
import { AgentProcessor } from './agent.processor.js';
import { AgentRunnerService } from './services/agent-runner.service.js';
import { AgentService } from './services/agent.service.js';
import { AgentToolsService } from './services/agent-tools.service.js';
import { CommandRegistryService } from './services/command-registry.service.js';
import { InterviewTurnService } from './services/interview-turn.service.js';

/**
 * Agent nhiều bước: thi hành kịch bản trong `.claude/commands/`.
 *
 * Phụ thuộc vào `DocumentsModule` chỉ để mượn `LATEX_COMPILER` - tool
 * `compile_pdf` cần nó để đếm số trang. Không gọi `DocumentsService`.
 */
@Module({
  imports: [
    AiModule,
    QueueModule,
    SkillsModule,
    StorageModule,
    DocumentsModule,
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentRunnerService,
    AgentToolsService,
    AgentContextService,
    CommandRegistryService,
    AgentProcessor,
    InterviewTurnService,
  ],
  exports: [AgentService],
})
export class AgentModule {}
