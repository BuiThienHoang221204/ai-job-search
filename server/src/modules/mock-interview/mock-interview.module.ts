import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { InterviewTurnService } from './service/interview-turn.service.js';
import { MockInterviewController } from './mock-interview.controller.js';
import { MockInterviewService } from './service/mock-interview.service.js';

@Module({
  imports: [AiModule],
  controllers: [MockInterviewController],
  providers: [MockInterviewService, InterviewTurnService],
})
export class MockInterviewModule {}
