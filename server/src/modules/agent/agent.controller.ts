import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  Logger,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { ThrottleAi } from '../../common/throttle.js';
import { AgentService } from './services/agent.service.js';
import { InterviewTurnService } from './services/interview-turn.service.js';
import {
  AnswerAgentDto,
  ListAgentRunsDto,
  ReadArtifactDto,
  StartAgentDto,
} from './dto/agent.dto.js';

@ApiTags('Agent Runs')
@ApiBearerAuth()
@Controller('agent-runs')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly agent: AgentService,
    private readonly queue: QueueService,
    private readonly turns: InterviewTurnService,
  ) {}

  @ApiOperation({
    summary: 'Lấy danh sách các lượt chạy agent của người dùng hiện tại',
  })
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListAgentRunsDto) {
    return this.agent.list(user.id, query);
  }

  /** Phải khai TRƯỚC ':id', nếu không Nest coi "workflows" là một id. */
  @ApiOperation({ summary: 'Lấy danh sách các workflow hiện có của agent' })
  @Get('workflows')
  workflows() {
    return this.agent.workflows();
  }

  /**
   * Nội dung một file agent đã ghi. Tên file đi qua query chứ không qua path:
   * nó chứa dấu gạch chéo ("cv/main.tex") và Nest sẽ cắt nó thành hai đoạn.
   */
  @ApiOperation({
    summary: 'Đọc nội dung một file agent đã ghi trong lượt chạy',
  })
  @ApiParam({ name: 'id', description: 'ID của lượt chạy agent' })
  @Get(':id/artifact')
  artifact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: ReadArtifactDto,
  ) {
    return this.agent.artifact(user.id, id, query.name);
  }

  @ApiOperation({ summary: 'Lấy chi tiết một lượt chạy agent theo ID' })
  @ApiParam({ name: 'id', description: 'ID của lượt chạy agent' })
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agent.detail(user.id, id);
  }

  /**
   * Bắt đầu một lượt chạy. Trả về ngay `runId`; agent chạy trong hàng đợi và
   * giao diện hỏi lại trạng thái, giống mọi tác vụ AI khác của hệ thống.
   */
  @ThrottleAi()
  @ApiOperation({ summary: 'Bắt đầu một lượt chạy agent mới' })
  @Post()
  async start(@CurrentUser() user: AuthUser, @Body() dto: StartAgentDto) {
    const run = await this.agent.start(user.id, dto);
    await this.queue.send(QUEUE.AGENT_RUN, {
      runId: run.id,
      userId: user.id,
    });
    return { queued: true, runId: run.id };
  }

  /**
   * Chạy lại một lượt đã hỏng. Tiếp từ chỗ dừng nếu còn điểm khôi phục, không
   * thì bắt đầu lại từ chính đầu vào cũ - người dùng không phải dán lại JD.
   */
  @ThrottleAi()
  @ApiOperation({ summary: 'Thử lại một lượt chạy agent bị lỗi' })
  @ApiParam({ name: 'id', description: 'ID của lượt chạy agent' })
  @Post(':id/retry')
  async retry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const run = await this.agent.retry(user.id, id);
    await this.queue.send(QUEUE.AGENT_RUN, { runId: run.id, userId: user.id });
    return { queued: true, runId: run.id };
  }

  /** Trả lời câu hỏi agent đang chờ, rồi cho nó chạy tiếp. */
  @ThrottleAi()
  @ApiOperation({ summary: 'Trả lời câu hỏi phản hồi mà agent đang chờ' })
  @ApiParam({ name: 'id', description: 'ID của lượt chạy agent' })
  @Post(':id/answer')
  async answer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AnswerAgentDto,
  ) {
    const run = await this.agent.answer(user.id, id, dto.text);
    await this.queue.send(QUEUE.AGENT_RUN, { runId: run.id, userId: user.id });
    return { queued: true, runId: run.id };
  }

  /**
   * Mở buổi phỏng vấn mới và stream câu hỏi đầu tiên ngay, không qua hàng đợi.
   *
   * Thay cho `POST /agent-runs {workflow:interview}` 5 bước 28s: một lần
   * streamText với dossier 2k, 3s đã thấy chữ. `web_search` dời sang câu 2.
   */
  @ThrottleAi()
  @ApiOperation({ summary: 'Mở buổi phỏng vấn thử và stream câu hỏi đầu tiên' })
  @Post('interview/open-stream')
  async openInterview(
    @CurrentUser() user: AuthUser,
    @Body() dto: { jobId: string },
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

  /**
   * Trả lời một lượt phỏng vấn và NHẬN CHỮ NGAY, không qua hàng đợi.
   *
   * Đo trên một buổi thật: mỗi lượt mất 18,9 giây và người dùng nhìn màn hình
   * trống suốt chừng đó, vì model sinh xong 822 token mới trả về một cục, rồi
   * frontend còn hỏi lại mỗi 4 giây nữa. Stream không làm model nhanh hơn — nó
   * biến 19 giây im lặng thành 3 giây rồi chữ chạy dần, đúng nhịp một người
   * phỏng vấn thật nói.
   *
   * Trả chữ thô chứ không phải SSE: một luồng, một người đọc, không có nhiều
   * loại sự kiện nào để phân biệt. Thêm khung `data:` của SSE ở đây chỉ là thêm
   * thứ để bóc ở đầu bên kia.
   *
   * `X-Accel-Buffering: no` là bắt buộc, không phải phòng xa: nginx mặc định
   * gom cả phản hồi rồi mới trả, và khi đó tính năng hỏng ÂM THẦM — máy dev thấy
   * chữ chạy, lên server thì lại đứng im 19 giây như cũ.
   */
  @ThrottleAi()
  @ApiOperation({
    summary: 'Gửi câu trả lời phỏng vấn dưới dạng stream chữ thô',
  })
  @ApiParam({ name: 'id', description: 'ID của lượt chạy agent phỏng vấn' })
  @Post(':id/turn')
  async turn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AnswerAgentDto,
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
      /*
       * Header đã gửi rồi thì không đổi được mã trạng thái nữa. Đóng kết nối
       * đột ngột là tín hiệu duy nhất còn lại, và frontend đọc nó thành "lượt
       * này hỏng, xoá phần chữ dở đi" - xem `interview-stream.ts`.
       */
      this.logger.error(
        `Lượt phỏng vấn ${id} hỏng: ${error instanceof Error ? error.message : String(error)}`,
      );
      response.destroy();
      return;
    }

    response.end();
  }
}
