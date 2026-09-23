import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ThrottleAi } from '../../common/throttle.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  AnswerTurnDto,
  ListMockInterviewsDto,
  OpenMockInterviewDto,
} from './mock-interview.dto.js';
import { InterviewTurnService } from './service/interview-turn.service.js';
import { MockInterviewService } from './service/mock-interview.service.js';

@ApiTags('Phỏng vấn thử')
@ApiBearerAuth()
@Controller('mock-interviews')
export class MockInterviewController {
  private readonly logger = new Logger(MockInterviewController.name);

  constructor(
    private readonly sessions: MockInterviewService,
    private readonly turns: InterviewTurnService,
  ) {}

  @ApiOperation({ summary: 'Danh sách buổi luyện của người dùng hiện tại' })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListMockInterviewsDto) {
    return this.sessions.list(user.id, query);
  }

  @ApiOperation({ summary: 'Chi tiết một buổi luyện theo ID' })
  @ApiParam({ name: 'id', description: 'ID của buổi luyện' })
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sessions.detail(user.id, id);
  }

  @ThrottleAi()
  @ApiOperation({ summary: 'Mở buổi phỏng vấn thử và stream câu hỏi đầu tiên' })
  @Post()
  async open(
    @CurrentUser() user: AuthUser,
    @Body() dto: OpenMockInterviewDto,
    @Res() response: Response,
  ): Promise<void> {
    let runId: string | null = null;
    try {
      const opened = await this.turns.openStream(user.id, dto.jobId);
      runId = opened.runId;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('X-Accel-Buffering', 'no');
      response.setHeader('X-Run-Id', runId);
      response.flushHeaders();
      for await (const piece of opened.stream) {
        response.write(piece);
      }
    } catch (error) {
      this.logger.error(
        `Mở buổi phỏng vấn hỏng${runId ? ` ${runId}` : ''}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (!response.headersSent) throw error;
      response.destroy();
      return;
    }
    response.end();
  }

  @ThrottleAi()
  @ApiOperation({
    summary: 'Gửi câu trả lời và nhận lượt tiếp theo dạng stream',
  })
  @ApiParam({ name: 'id', description: 'ID của buổi luyện' })
  @Post(':id/turn')
  async turn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AnswerTurnDto,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    try {
      for await (const piece of this.turns.stream(user.id, id, dto.text)) {
        response.write(piece);
      }
    } catch (error) {
      this.logger.error(
        `Lượt phỏng vấn ${id} hỏng: ${error instanceof Error ? error.message : String(error)}`,
      );
      response.destroy();
      return;
    }

    response.end();
  }
}
