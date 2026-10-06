import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { InterviewTurnService } from './service/interview-turn.service';
import { MockInterviewController } from './mock-interview.controller';
import { MockInterviewService } from './service/mock-interview.service';

@Module({
  imports: [AiModule],
  controllers: [MockInterviewController],
  providers: [MockInterviewService, InterviewTurnService],
})
export class MockInterviewModule {}
