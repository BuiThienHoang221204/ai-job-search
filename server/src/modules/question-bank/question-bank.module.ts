import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { QuestionBankController } from './question-bank.controller';
import { QuestionBankService } from './question-bank.service';

@Module({
  imports: [AiModule],
  controllers: [QuestionBankController],
  providers: [QuestionBankService],
})
export class QuestionBankModule {}
