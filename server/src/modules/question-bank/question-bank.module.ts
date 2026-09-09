import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { QuestionBankController } from './question-bank.controller.js';
import { QuestionBankService } from './question-bank.service.js';

@Module({
  imports: [AiModule],
  controllers: [QuestionBankController],
  providers: [QuestionBankService],
  exports: [QuestionBankService],
})
export class QuestionBankModule {}
