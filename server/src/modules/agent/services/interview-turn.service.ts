import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ModelMessage } from 'ai';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AiService } from '../../ai/services/ai.service.js';
import { AgentContextService } from './agent-context.service.js';
import { AgentService } from './agent.service.js';
import { ASK_USER_TOOL } from '../tools/ask-user.tool.js';
import {
  countForeign,
  createStreamScrubber,
  interviewTurnSystem,
  splitTurnMarker,
  splitTurnParts,
  type TurnParts,
} from '../prompts/interview-turn-prompt.js';
import { STUCK_AFTER_MS } from '../../reconcile/services/reconcile.service.js';

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
    private readonly context: AgentContextService,
  ) {}

  /**
   * Mở buổi mới: tạo AgentRun rồi stream câu hỏi đầu tiên ngay trong request.
   *
   * Khác `AgentRunnerService.run()` 5 bước 28s: chỉ một lần `streamText` với
   * `interviewTurnSystem` (~100 tok) + dossier 2k, không `web_search`, không
   * qua queue. 3s đã thấy chữ đầu thay vì poll 14 lần.
   */
  async openStream(
    userId: string,
    jobId: string,
  ): Promise<{ runId: string; stream: AsyncGenerator<string> }> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

    await this.assertNoRunInFlight(userId);

    const run = await this.prisma.agentRun.create({
      data: {
        userId,
        workflow: 'interview',
        jobId,
        status: 'RUNNING',
        startedAt: new Date(),
        input: {},
      },
    });

    const dossier = await this.context.build({
      userId,
      workflow: 'interview',
      jobId,
    });
    if (!dossier) {
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', error: 'Không dựng được bối cảnh' },
      });
      throw new BadRequestException('Không dựng được bối cảnh phỏng vấn');
    }

    const startedAt = Date.now();
    const openingPrompt = `${dossier}\n\n---\nHãy bắt đầu buổi phỏng vấn. Đây là lượt đầu tiên, chưa có câu trả lời nào của ứng viên, nên BỎ QUA phần nhận xét, viết thẳng "TIẾP" rồi xuống dòng rồi "${'@@HOI@@'}" rồi một câu hỏi mở đầu về động lực/Agile.`;
    const { result } = await this.ai.streamText({
      system: interviewTurnSystem(),
      messages: [{ role: 'user', content: openingPrompt }],
      modelId: process.env.AI_INTERVIEW_MODEL_ID || undefined,
      context: { purpose: 'interview.open', userId },
    });

    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias
    async function* gen(): AsyncGenerator<string> {
      let head = '';
      let resolved = false;
      let done = false;
      let body = '';
      // Lượt đầu không có feedback - phải giấu phần trước @@HOI@@ khỏi stream
      let pendingQuestion = '';
      let markerSeen = false;
      const scrub = createStreamScrubber();
      const emitQuestion = (raw: string): string => {
        body += raw;
        pendingQuestion += raw;
        const idx = pendingQuestion.indexOf('@@HOI@@');
        if (!markerSeen && idx === -1) return '';
        if (!markerSeen) {
          markerSeen = true;
          const questionPart = pendingQuestion.slice(idx + '@@HOI@@'.length);
          pendingQuestion = questionPart;
          return scrub.push(questionPart);
        }
        return scrub.push(raw);
      };

      for await (const piece of result.textStream) {
        if (!resolved) {
          head += piece;
          if (!head.includes('\n') && head.length < 32) continue;
          const split = splitTurnMarker(head);
          resolved = true;
          done = split.done;
          // split.rest có thể chứa "feedback @@HOI@@ question" - chỉ stream question
          const out = emitQuestion(split.rest);
          if (out) yield out;
          continue;
        }
        const out = emitQuestion(piece);
        if (out) yield out;
      }
      if (!resolved && head) {
        const split = splitTurnMarker(head);
        done = split.done;
        const out = emitQuestion(split.rest);
        if (out) yield out;
      }
      const tail = scrub.flush();
      if (tail) yield tail;

      const rawParts = splitTurnParts(body);
      if (!rawParts.question) {
        await self.prisma.agentRun.update({
          where: { id: run.id },
          data: { status: 'FAILED', error: 'Model không trả về câu hỏi nào' },
        });
        throw new BadRequestException('Model không trả về nội dung nào.');
      }
      // Lượt đầu không có câu trả lời nào để nhận xét - model hay bịa feedback
      // dù prompt đã dặn bỏ qua. Bỏ hẳn để không hiện "Câu trả lời rất rõ ràng..." khi chưa trả lời.
      if (rawParts.feedback) {
        self.logger.warn(
          `Mở buổi ${run.id} model bịa feedback lượt đầu (${rawParts.feedback.length} ký tự), đã bỏ.`,
        );
      }
      const parts: TurnParts = { feedback: '', question: rawParts.question };

      const messages: ModelMessage[] = [
        { role: 'user', content: dossier },
        { role: 'assistant', content: body.trim() },
      ];

      await self.prisma.$transaction([
        self.prisma.agentStep.create({
          data: {
            runId: run.id,
            index: 0,
            text: parts.feedback,
            toolCalls: [
              { tool: ASK_USER_TOOL, input: { question: parts.question } },
            ],
            toolResults: [
              { tool: ASK_USER_TOOL, output: { asked: parts.question } },
            ],
            durationMs: Date.now() - startedAt,
          },
        }),
        self.prisma.agentRun.update({
          where: { id: run.id },
          data: {
            status: done ? 'DONE' : 'WAITING_USER',
            question: done ? null : parts.question,
            messages: messages as unknown as Prisma.InputJsonValue,
            startedAt: new Date(startedAt),
          },
        }),
      ]);

      self.logger.log(
        `Mở buổi phỏng vấn ${run.id} xong sau ${Date.now() - startedAt}ms`,
      );

      const foreign = countForeign(body);
      if (foreign > 0) {
        self.logger.warn(
          `Model chèn ${foreign} ký tự ngoài Latin, đã xoá. Xem AI_INTERVIEW_MODEL_ID.`,
        );
      }
    }

    return { runId: run.id, stream: gen() };
  }

  private async assertNoRunInFlight(userId: string): Promise<void> {
    const running = await this.prisma.agentRun.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'RUNNING'] },
        updatedAt: { gte: new Date(Date.now() - STUCK_AFTER_MS) },
      },
      select: { id: true },
    });
    if (running) {
      throw new ConflictException(
        'Bạn đang có một lượt chạy chưa xong. Đợi nó kết thúc rồi hãy chạy lượt mới.',
      );
    }
  }

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

    /*
     * Đã xoá chữ ngoài bảng Latin thì NÓI RA, đừng dọn im lặng.
     *
     * Cùng lý do `LatexCompiler` gom các dòng `Missing character` thay vì bỏ
     * qua: dọn cho người dùng đọc được là đúng, nhưng nó cũng là thước đo model
     * này còn dùng được hay không. Dọn im lặng thì tín hiệu đó biến mất, và
     * không ai biết chất lượng đang trôi.
     */
    const foreign = countForeign(body);
    if (foreign > 0) {
      this.logger.warn(
        `Model chèn ${foreign} ký tự ngoài bảng Latin vào câu tiếng Việt, đã xoá. Đây là dấu hiệu model yếu cho tác vụ này - xem AI_INTERVIEW_MODEL_ID.`,
      );
    }
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
