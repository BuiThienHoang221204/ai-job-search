import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AgentContextService } from './agent-context.service.js';
import { AgentController } from './agent.controller.js';
import { AgentProcessor } from './agent.processor.js';
import { AgentRunnerService } from './agent-runner.service.js';
import { AgentService } from './agent.service.js';
import { AgentToolsService } from './agent-tools.service.js';
import { CommandRegistryService } from './command-registry.service.js';
import { InterviewTurnService } from './interview-turn.service.js';

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
