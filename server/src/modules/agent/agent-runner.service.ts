import { Injectable, Logger } from '@nestjs/common';
import type { ModelMessage } from 'ai';
import type { AgentRun, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService, type AgentStepLog } from '../ai/services/ai.service.js';
import { AgentToolsService } from './agent-tools.service.js';
import type { AgentInput, ArtifactRecord } from './agent.types.js';
import { CommandRegistryService } from './command-registry.service.js';
import {
  buildOpeningPrompt,
  buildSystemPrompt,
} from './prompts/system-prompt.js';

/** Tool mà agent gọi khi nó muốn dừng lại hỏi người dùng. */
const ASK_USER = 'ask_user';

/**
 * Chạy một kịch bản `.claude/commands/` từ đầu tới cuối.
 *
 * Ba điều khiến nó khác `DocumentsService.generate()` về bản chất, không chỉ về
 * độ dài:
 *
 * 1. **Model điều khiển luồng.** Không có schema định trước cho kết quả; nó
 *    quyết định gọi tool nào, mấy lần. Vì vậy mọi trần đều nằm ở phía ta.
 * 2. **Lượt chạy có thể dừng giữa chừng** để hỏi người dùng rồi chạy tiếp ở một
 *    request khác - lịch sử hội thoại phải sống trong database, không sống
 *    trong bộ nhớ tiến trình.
 * 3. **Đầu vào là dữ liệu thù địch.** Mô tả công việc do bên thứ ba soạn, và
 *    agent lại có tool thật, nên ranh giới tin cậy được nhắc lại trong system
 *    prompt chứ không chỉ trông vào kịch bản.
 */
@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly commands: CommandRegistryService,
    private readonly toolbox: AgentToolsService,
  ) {}

  /** Chạy hoặc chạy tiếp một lượt. Được gọi từ worker, không từ HTTP. */
  async run(runId: string): Promise<AgentRun> {
    const run = await this.prisma.agentRun.findUniqueOrThrow({
      where: { id: runId },
    });

    /*
     * Giữ tham chiếu ra ngoài khối `try` để nhánh hỏng vẫn thấy được.
     *
     * File agent đã ghi nằm sẵn trong Storage rồi; mất chúng khỏi bản ghi chỉ là
     * mất đường tìm lại. Đã xảy ra thật: một lượt hết giờ ở bước cuối, CV và thư
     * đều đã soạn xong, nhưng màn hình chỉ hiện "thất bại" và trắng trơn.
     */
    let collected: ArtifactRecord[] = [];

    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'RUNNING',
        error: null,
        startedAt: run.startedAt ?? new Date(),
      },
    });

    try {
      const command = await this.commands.get(run.workflow);
      const input = (run.input ?? {}) as AgentInput;
      const limits = this.toolbox.limits();
      const { tools, artifacts } = this.toolbox.build({
        runId: run.id,
        userId: run.userId,
        sourceUrl: input.jobUrl,
      });
      collected = artifacts;

      const startIndex = await this.nextStepIndex(runId);
      const result = await this.ai.runTools({
        system: buildSystemPrompt(command.body, limits),
        ...this.conversation(run, input),
        tools,
        stopOnTool: ASK_USER,
        context: { purpose: `agent.${run.workflow}`, userId: run.userId },
        maxSteps: limits.maxSteps,
        timeoutMs: limits.timeoutMs,
        onStep: (step) => this.recordStep(runId, startIndex + step.index, step),
      });

      const question = this.pendingQuestion(result.steps);

      return await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: question ? 'WAITING_USER' : 'DONE',
          question: question ?? null,
          answer: question ? null : run.answer,
          messages: result.messages as unknown as Prisma.InputJsonValue,
          modelId: result.modelId,
          result: {
            text: result.text,
            artifacts,
            finishReason: result.finishReason,
          },
          finishedAt: question ? null : new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lượt chạy agent ${runId} thất bại: ${message}`);
      return this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          error: message,
          finishedAt: new Date(),
          result: { artifacts: collected },
        },
      });
    }
  }

  /**
   * Lượt chạy MỚI đi bằng `prompt`; lượt chạy TIẾP đi bằng cả hội thoại cũ.
   *
   * Nạp lại nguyên văn thay vì kể lại tóm tắt: ngữ cảnh đó đã tốn tiền để dựng,
   * và một bản kể lại sẽ đánh mất đúng những chi tiết agent vừa tra được.
   */
  private conversation(
    run: AgentRun,
    input: AgentInput,
  ): { prompt: string } | { messages: ModelMessage[] } {
    const previous = run.messages as ModelMessage[] | null;
    if (!Array.isArray(previous) || previous.length === 0) {
      return { prompt: buildOpeningPrompt(input) };
    }

    return {
      messages: [
        ...previous,
        {
          role: 'user',
          content: `Người dùng trả lời: ${run.answer ?? '(không có nội dung)'}`,
        },
      ],
    };
  }

  /**
   * Bước tiếp theo được đánh số mấy.
   *
   * Lượt chạy tiếp phải đánh số nối vào lượt trước, nếu không khoá duy nhất
   * `(runId, index)` sẽ đụng và cả lượt chạy hỏng vì một chuyện ghi nhật ký.
   */
  private async nextStepIndex(runId: string): Promise<number> {
    const last = await this.prisma.agentStep.findFirst({
      where: { runId },
      orderBy: { index: 'desc' },
      select: { index: true },
    });
    return last ? last.index + 1 : 0;
  }

  private async recordStep(
    runId: string,
    index: number,
    step: AgentStepLog,
  ): Promise<void> {
    await this.prisma.agentStep.create({
      data: {
        runId,
        index,
        text: step.text,
        toolCalls: step.toolCalls as unknown as Prisma.InputJsonValue,
        toolResults: step.toolResults as unknown as Prisma.InputJsonValue,
        durationMs: step.durationMs,
      },
    });
  }

  /** Agent có dừng lại để hỏi hay không, và hỏi gì. */
  private pendingQuestion(steps: AgentStepLog[]): string | null {
    const call = steps
      .at(-1)
      ?.toolCalls.find((entry) => entry.tool === ASK_USER);
    if (!call) return null;

    const input = call.input as { question?: unknown };
    return typeof input?.question === 'string'
      ? input.question
      : 'Bạn chọn gì?';
  }
}
