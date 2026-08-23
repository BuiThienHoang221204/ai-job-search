import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { ModelMessage } from 'ai';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/services/ai.service.js';
import { AgentService } from './agent.service.js';
import { ASK_USER_TOOL } from './tools/ask-user.tool.js';
import {
  createStreamScrubber,
  interviewTurnSystem,
  splitTurnMarker,
  splitTurnParts,
  type TurnParts,
} from './prompts/interview-turn-prompt.js';

/**
 * MỘT lượt đối đáp trong buổi luyện phỏng vấn, chạy thẳng trong request HTTP.
 *
 * Vì sao không đi qua hàng đợi như mọi lượt chạy agent khác: hàng đợi tồn tại
 * cho việc chạy lâu mà người dùng bỏ đi rồi quay lại. Một lượt phỏng vấn là
 * đúng thứ ngược lại — họ đang ngồi nhìn màn hình, và nếu họ đóng tab thì câu
 * hỏi đó cũng hết ý nghĩa.
 *
 * Chạy trong request là điều kiện để STREAM được. Token sinh ra ở tiến trình
 * worker thì không có đường nào chở về kết nối HTTP đang mở ở tiến trình API,
 * trừ khi dựng thêm một tầng pub/sub — cả một hạ tầng mới cho một tính năng.
 *
 * Giai đoạn MỞ buổi vẫn ở hàng đợi như cũ: nó đọc hồ sơ, đọc khung STAR, tra
 * web về công ty — 6 bước có tool, khoảng 52 giây. Đó mới là việc nền thật.
 */
@Injectable()
export class InterviewTurnService {
  private readonly logger = new Logger(InterviewTurnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly agents: AgentService,
  ) {}

  /**
   * Ghi câu trả lời, gọi model, phát từng mẩu chữ ra ngoài.
   *
   * Chỉ ghi vào database SAU KHI stream chạy xong: một câu hỏi dở dang tệ hơn
   * không có câu nào — người dùng không biết câu hỏi đã hết chưa và có thể trả
   * lời một câu chưa hỏi hết. Đứt giữa chừng thì lượt này coi như chưa xảy ra,
   * tải lại trang là sạch, và câu trả lời họ vừa gõ vẫn còn.
   */
  async *stream(
    userId: string,
    runId: string,
    answer: string,
  ): AsyncGenerator<string> {
    const run = await this.agents.get(userId, runId);

    if (run.workflow !== 'interview') {
      throw new BadRequestException(
        'Chỉ buổi luyện phỏng vấn mới trả lời theo kiểu này.',
      );
    }
    if (run.status !== 'WAITING_USER') {
      throw new BadRequestException(
        `Lượt chạy đang ở trạng thái ${run.status}, không chờ câu trả lời nào.`,
      );
    }

    const previous = run.messages as ModelMessage[] | null;
    if (!Array.isArray(previous) || previous.length === 0) {
      throw new BadRequestException(
        'Buổi luyện chưa có hội thoại nào để nối tiếp.',
      );
    }

    const messages: ModelMessage[] = [
      ...previous,
      { role: 'user', content: answer },
    ];

    const startedAt = Date.now();
    const { result } = await this.ai.streamText({
      system: interviewTurnSystem(),
      messages,
      modelId: process.env.AI_INTERVIEW_MODEL_ID || undefined,
      context: { purpose: 'interview.turn', userId },
    });

    /*
     * Giữ lại cho tới khi biết dòng điều khiển kết thúc ở đâu.
     *
     * Không đệm thì mẩu đầu tiên mang theo chữ "TIẾP" ra thẳng màn hình. Đệm
     * chỉ tới dấu xuống dòng ĐẦU TIÊN, nên độ trễ thêm đúng bằng thời gian model
     * sinh vài ký tự - không phải chờ cả câu.
     */
    let head = '';
    let resolved = false;
    let done = false;
    let body = '';
    const scrub = createStreamScrubber();

    /** Gom vào bản LƯU nguyên văn, phát ra ngoài bản ĐÃ LỌC. */
    const emit = (raw: string): string => {
      body += raw;
      return scrub.push(raw);
    };

    for await (const piece of result.textStream) {
      if (!resolved) {
        head += piece;
        if (!head.includes('\n') && head.length < 32) continue;

        const split = splitTurnMarker(head);
        resolved = true;
        done = split.done;
        const out = emit(split.rest);
        if (out) yield out;
        continue;
      }

      const out = emit(piece);
      if (out) yield out;
    }

    if (!resolved && head) {
      const split = splitTurnMarker(head);
      done = split.done;
      const out = emit(split.rest);
      if (out) yield out;
    }

    const tail = scrub.flush();
    if (tail) yield tail;

    const parts = splitTurnParts(body);
    if (!parts.question) {
      throw new BadRequestException('Model không trả về nội dung nào.');
    }

    await this.persist(runId, answer, parts, done, Date.now() - startedAt, [
      ...messages,
      { role: 'assistant', content: body.trim() },
    ]);

    this.logger.log(
      `Lượt phỏng vấn ${runId} xong sau ${Date.now() - startedAt}ms, ${done ? 'kết thúc buổi' : 'còn hỏi tiếp'}`,
    );
  }

  /**
   * Ghi câu trả lời vào bước cũ và câu hỏi mới thành một bước mới.
   *
   * Hình dạng bước giữ NGUYÊN như khi vòng lặp agent gọi `ask_user`, dù ở đây
   * không có tool nào được gọi thật. Đó là chủ đích: `buildTranscript` ở frontend
   * dựng cả bản ghi buổi luyện từ đúng hình dạng đó, và giữ nó thì màn hình,
   * `pendingTurn`, lịch sử buổi luyện và việc tải lại trang giữa chừng đều không
   * phải sửa một dòng nào.
   *
   * Một `$transaction`: nửa chừng mà hỏng thì câu trả lời nằm đó không có câu
   * hỏi đi kèm, và bản ghi buổi luyện lệch vĩnh viễn.
   */
  private async persist(
    runId: string,
    answer: string,
    parts: TurnParts,
    done: boolean,
    durationMs: number,
    messages: ModelMessage[],
  ): Promise<void> {
    const [last, previousStep] = await Promise.all([
      this.prisma.agentStep.findFirst({
        where: { runId },
        orderBy: { index: 'desc' },
        select: { index: true },
      }),
      this.prisma.agentStep.findFirst({
        where: { runId },
        orderBy: { index: 'desc' },
        select: { id: true, toolResults: true },
      }),
    ]);

    const answered = withAnswer(previousStep?.toolResults, answer);

    await this.prisma.$transaction([
      ...(answered && previousStep
        ? [
            this.prisma.agentStep.update({
              where: { id: previousStep.id },
              data: { toolResults: answered },
            }),
          ]
        : []),
      this.prisma.agentStep.create({
        data: {
          runId,
          index: (last?.index ?? -1) + 1,
          // `text` là nơi `buildTranscript` đọc NHẬN XÉT ra, và nó gắn vào lượt
          // TRƯỚC - đúng ngữ nghĩa: nhận xét là dành cho câu vừa trả lời.
          text: parts.feedback,
          toolCalls: [
            { tool: ASK_USER_TOOL, input: { question: parts.question } },
          ],
          toolResults: [
            { tool: ASK_USER_TOOL, output: { asked: parts.question } },
          ],
          durationMs,
        },
      }),
      this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: done ? 'DONE' : 'WAITING_USER',
          question: done ? null : parts.question,
          answer: null,
          messages: messages as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
  }
}

/** Gắn câu trả lời vào kết quả `ask_user` của bước trước, giữ nguyên phần còn lại. */
function withAnswer(
  toolResults: unknown,
  answer: string,
): Prisma.InputJsonValue | null {
  if (!Array.isArray(toolResults)) return null;

  const results = toolResults as Array<{
    tool?: string;
    output?: Record<string, unknown>;
  }>;
  const asked = results.find((entry) => entry?.tool === ASK_USER_TOOL);
  if (!asked) return null;

  asked.output = { ...(asked.output ?? {}), answer };
  return results as unknown as Prisma.InputJsonValue;
}
