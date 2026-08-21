import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { QUEUE, QueueService } from '../queue/queue.service.js';
import { ThrottleAi } from '../../common/throttle.js';
import { AgentService } from './agent.service.js';
import { AnswerAgentDto, StartAgentDto } from './dto/agent.dto.js';

@Controller('agent-runs')
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly queue: QueueService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.agent.list(user.id, query);
  }

  /** Phải khai TRƯỚC ':id', nếu không Nest coi "workflows" là một id. */
  @Get('workflows')
  workflows() {
    return this.agent.workflows();
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.agent.get(user.id, id);
  }

  /**
   * Bắt đầu một lượt chạy. Trả về ngay `runId`; agent chạy trong hàng đợi và
   * giao diện hỏi lại trạng thái, giống mọi tác vụ AI khác của hệ thống.
   */
  @ThrottleAi()
  @Post()
  async start(@CurrentUser() user: AuthUser, @Body() dto: StartAgentDto) {
    const run = await this.agent.start(user.id, dto);
    await this.queue.send(QUEUE.AGENT_RUN, {
      runId: run.id,
      userId: user.id,
    });
    return { queued: true, runId: run.id };
  }

  /** Trả lời câu hỏi agent đang chờ, rồi cho nó chạy tiếp. */
  @ThrottleAi()
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
}
