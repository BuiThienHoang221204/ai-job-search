import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { ThrottleAi } from '../../common/throttle.js';
import { ListQuestionsQueryDto } from './question-bank.dto.js';
import { QuestionBankService } from './question-bank.service.js';

/** Ba route ĐỌC `@Public()` nên phải có hạn mức riêng; route sinh đáp án thì không. */
@ApiTags('Question Bank')
@Controller('question-bank')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class QuestionBankController {
  constructor(private readonly questions: QuestionBankService) {}

  @ApiOperation({
    summary: 'Số câu theo ngành, loại và độ khó — dùng dựng thanh lọc',
  })
  @Public()
  @Get('filters')
  filters(@Query() query: ListQuestionsQueryDto) {
    return this.questions.facets(query);
  }

  @ApiOperation({ summary: 'Danh sách câu hỏi, lọc theo ngành/loại/độ khó' })
  @Public()
  @Get()
  list(@Query() query: ListQuestionsQueryDto) {
    return this.questions.list(query);
  }

  @ApiOperation({ summary: 'Chi tiết một câu hỏi kèm đáp án nếu đã có' })
  @ApiParam({ name: 'id', description: 'ID câu hỏi' })
  @Public()
  @Get(':id')
  get(@Param('id') id: string) {
    return this.questions.get(id);
  }

  /** Đường GHI duy nhất, và là đường duy nhất gọi model. */
  @ApiOperation({
    summary: 'Sinh đáp án cho một câu hỏi, hoặc trả về đáp án đã có',
  })
  @ApiParam({ name: 'id', description: 'ID câu hỏi' })
  @ApiBearerAuth()
  @ThrottleAi()
  @Post(':id/answer')
  answer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.questions.ensureAnswer(id, user.id);
  }
}
