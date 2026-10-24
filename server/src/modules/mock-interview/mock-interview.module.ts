import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { InterviewTurnService } from './services/interview-turn.service';
import { MockInterviewController } from './mock-interview.controller';
import { MockInterviewService } from './services/mock-interview.service';
import { LiveTokenService } from './services/live-token.service';
import { VoiceSessionService } from './services/voice-session.service';

@Module({
  imports: [AiModule],
  controllers: [MockInterviewController],
  providers: [
    MockInterviewService,
    InterviewTurnService,
    LiveTokenService,
    VoiceSessionService,
  ],
})
export class MockInterviewModule {}
