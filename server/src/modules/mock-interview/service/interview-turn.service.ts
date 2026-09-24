import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ModelMessage } from 'ai';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AiService } from '../../ai/services/ai.service.js';
import { MockInterviewService } from './mock-interview.service.js';
import {
  countForeign,
  createStreamScrubber,
  interviewTurnSystem,
  QUESTION_MARK,
  splitTurnMarker,
  splitTurnParts,
  TURN_MARKER,
  type TurnParts,
} from '../utils/interview-turn.prompt.js';
import {
  askUserStep,
  attachAnswer,
  HEAD_BUFFER,
  type StreamedTurn,
} from '../utils/mock-interview.js';

@Injectable()
export class InterviewTurnService {
  private readonly logger = new Logger(InterviewTurnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly sessions: MockInterviewService,
  ) {}

  async openStream(
    userId: string,
    jobId: string,
  ): Promise<{ runId: string; stream: AsyncGenerator<string> }> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

    await this.sessions.assertNoRunInFlight(userId);

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

    const dossier = await this.sessions.buildContext(userId, jobId);
    if (!dossier) {
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', error: 'Không dựng được bối cảnh' },
      });
      throw new BadRequestException('Không dựng được bối cảnh phỏng vấn');
    }

    const startedAt = Date.now();
    const openingPrompt = `${dossier}\n\n---\nHãy bắt đầu buổi phỏng vấn. Đây là lượt đầu tiên, chưa có câu trả lời nào của ứng viên, nên BỎ QUA phần nhận xét, viết thẳng "${TURN_MARKER.next}" rồi xuống dòng rồi "${QUESTION_MARK}" rồi một câu hỏi mở đầu về động lực/Agile.`;
    const { result } = await this.ai.streamText({
      system: interviewTurnSystem(),
      messages: [{ role: 'user', content: openingPrompt }],
      modelId: process.env.AI_INTERVIEW_MODEL_ID || undefined,
      context: { purpose: 'interview.open', userId },
    });

    return {
      runId: run.id,
      stream: this.openTurn(run.id, dossier, result.textStream, startedAt),
    };
  }

  private async *openTurn(
    runId: string,
    dossier: string,
    textStream: AsyncIterable<string>,
    startedAt: number,
  ): AsyncGenerator<string> {
    const turn: StreamedTurn = { body: '', done: false };
    yield* this.pump(textStream, turn, true);

    const rawParts = splitTurnParts(turn.body);
    if (!rawParts.question) {
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: { status: 'FAILED', error: 'Model không trả về câu hỏi nào' },
      });
      throw new BadRequestException('Model không trả về nội dung nào.');
    }

    if (rawParts.feedback) {
      this.logger.warn(
        `Mở buổi ${runId} model bịa feedback lượt đầu (${rawParts.feedback.length} ký tự), đã bỏ.`,
      );
    }
    const parts: TurnParts = { feedback: '', question: rawParts.question };

    const messages: ModelMessage[] = [
      { role: 'user', content: dossier },
      { role: 'assistant', content: turn.body.trim() },
    ];

    await this.prisma.$transaction([
      this.prisma.agentStep.create({
        data: {
          runId,
          index: 0,
          text: parts.feedback,
          ...askUserStep(parts.question),
          durationMs: Date.now() - startedAt,
        },
      }),
      this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: turn.done ? 'DONE' : 'WAITING_USER',
          question: turn.done ? null : parts.question,
          messages: messages as unknown as Prisma.InputJsonValue,
          startedAt: new Date(startedAt),
        },
      }),
    ]);

    this.logger.log(
      `Mở buổi phỏng vấn ${runId} xong sau ${Date.now() - startedAt}ms`,
    );
    this.warnForeign(turn.body);
  }

  async *stream(
    userId: string,
    runId: string,
    answer: string,
  ): AsyncGenerator<string> {
    const run = await this.sessions.get(userId, runId);

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

    const turn: StreamedTurn = { body: '', done: false };
    yield* this.pump(result.textStream, turn, false);
    const { body, done } = turn;

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

    this.warnForeign(body);
  }

  private async *pump(
    textStream: AsyncIterable<string>,
    turn: StreamedTurn,
    hideUntilQuestion: boolean,
  ): AsyncGenerator<string> {
    let head = '';
    let resolved = false;
    let pending = '';
    let markerSeen = !hideUntilQuestion;
    const scrub = createStreamScrubber();

    const emit = (raw: string): string => {
      turn.body += raw;
      if (markerSeen) return scrub.push(raw);

      pending += raw;
      const at = pending.indexOf(QUESTION_MARK);
      if (at === -1) return '';

      markerSeen = true;
      return scrub.push(pending.slice(at + QUESTION_MARK.length));
    };

    for await (const piece of textStream) {
      if (!resolved) {
        head += piece;
        if (!head.includes('\n') && head.length < HEAD_BUFFER) continue;

        const split = splitTurnMarker(head);
        resolved = true;
        turn.done = split.done;
        const out = emit(split.rest);
        if (out) yield out;
        continue;
      }

      const out = emit(piece);
      if (out) yield out;
    }

    if (!resolved && head) {
      const split = splitTurnMarker(head);
      turn.done = split.done;
      const out = emit(split.rest);
      if (out) yield out;
    }

    const tail = scrub.flush();
    if (tail) yield tail;
  }

  private warnForeign(body: string): void {
    const foreign = countForeign(body);
    if (foreign > 0) {
      this.logger.warn(
        `Model chèn ${foreign} ký tự ngoài bảng Latin vào câu tiếng Việt, đã xoá. Đây là dấu hiệu model yếu cho tác vụ này - xem AI_INTERVIEW_MODEL_ID.`,
      );
    }
  }

  private async persist(
    runId: string,
    answer: string,
    parts: TurnParts,
    done: boolean,
    durationMs: number,
    messages: ModelMessage[],
  ): Promise<void> {
    const previous = await this.prisma.agentStep.findFirst({
      where: { runId },
      orderBy: { index: 'desc' },
      select: { id: true, index: true, toolResults: true },
    });

    const answered = attachAnswer(previous?.toolResults, answer);

    await this.prisma.$transaction([
      ...(answered && previous
        ? [
            this.prisma.agentStep.update({
              where: { id: previous.id },
              data: { toolResults: answered },
            }),
          ]
        : []),
      this.prisma.agentStep.create({
        data: {
          runId,
          index: (previous?.index ?? -1) + 1,
          text: parts.feedback,
          ...askUserStep(parts.question),
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
