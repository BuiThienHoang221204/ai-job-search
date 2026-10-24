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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ThrottleAi } from '@/common/throttle';
import type { AuthUser } from '@/common/types/auth-user';
import {
  AnswerTurnDto,
  ListMockInterviewsDto,
  OpenMockInterviewDto,
  OpenVoiceInterviewDto,
  VoiceTurnDto,
} from './mock-interview.dto';
import { InterviewTurnService } from './services/interview-turn.service';
import { MockInterviewService } from './services/mock-interview.service';
import { VoiceSessionService } from './services/voice-session.service';
import { withFailureKind } from '@/common/ai/failure-view';
import { messageOf } from '@/common/error-message';

@ApiTags('Phỏng vấn thử')
@ApiBearerAuth()
@Controller('mock-interviews')
export class MockInterviewController {
  private readonly logger = new Logger(MockInterviewController.name);

  constructor(
    private readonly sessions: MockInterviewService,
    private readonly turns: InterviewTurnService,
    private readonly voice: VoiceSessionService,
  ) {}

  @ApiOperation({ summary: 'Danh sách buổi luyện của người dùng hiện tại' })
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMockInterviewsDto,
  ) {
    const page = await this.sessions.list(user.id, query);
    return { ...page, items: page.items.map(withFailureKind) };
  }

  @ApiOperation({ summary: 'Chi tiết một buổi luyện theo ID' })
  @ApiParam({ name: 'id', description: 'ID của buổi luyện' })
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return withFailureKind(await this.sessions.detail(user.id, id));
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
      const opened = await this.turns.openStream(
        user.id,
        dto.jobId,
        dto.question,
      );
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
        `Mở buổi phỏng vấn hỏng${runId ? ` ${runId}` : ''}: ${messageOf(error)}`,
      );
      if (!response.headersSent) throw error;
      response.destroy();
      return;
    }
    response.end();
  }

  @ThrottleAi()
  @ApiOperation({
    summary:
      'Mở buổi phỏng vấn thử bằng giọng nói: trả token ngắn hạn để trình duyệt nối thẳng tới Gemini Live',
  })
  @Post('voice')
  openVoice(@CurrentUser() user: AuthUser, @Body() dto: OpenVoiceInterviewDto) {
    return this.voice.open(user.id, dto.jobId);
  }

  @ApiOperation({
    summary: 'Lưu một lượt hỏi-đáp của buổi luyện bằng giọng nói',
  })
  @ApiParam({ name: 'id', description: 'ID của buổi luyện' })
  @Post(':id/voice-turns')
  appendVoiceTurn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VoiceTurnDto,
  ) {
    return this.voice.appendTurn(user.id, id, dto);
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
    await this.pipeTurn(id, this.turns.stream(user.id, id, dto.text), response);
  }

  @ThrottleAi()
  @ApiOperation({
    summary: 'Kết thúc sớm buổi luyện và nhận lời tổng kết dạng stream',
  })
  @ApiParam({ name: 'id', description: 'ID của buổi luyện' })
  @Post(':id/finish')
  async finish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    await this.pipeTurn(id, this.turns.stream(user.id, id, null), response);
  }

  private async pipeTurn(
    id: string,
    stream: AsyncGenerator<string>,
    response: Response,
  ): Promise<void> {
    try {
      for await (const piece of stream) {
        if (!response.headersSent) {
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.setHeader('Cache-Control', 'no-cache, no-transform');
          response.setHeader('X-Accel-Buffering', 'no');
          response.flushHeaders();
        }
        response.write(piece);
      }
    } catch (error) {
      this.logger.error(`Lượt phỏng vấn ${id} hỏng: ${messageOf(error)}`);
      if (!response.headersSent) throw error;
      response.destroy();
      return;
    }

    response.end();
  }
}
