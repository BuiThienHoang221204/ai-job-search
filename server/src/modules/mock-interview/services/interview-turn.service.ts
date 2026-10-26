import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ModelMessage } from 'ai';
import type { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { messageOf } from '@/common/error-message';
import { estimateTokens } from '@/common/ai/token-estimate';
import { AiService } from '@/modules/ai/services/ai.service';
import { fastModelChain } from '@/modules/ai/utils/model-env';
import { MockInterviewService } from './mock-interview.service';
import {
  countForeign,
  createStreamScrubber,
  FINISH_REQUEST,
  INTERVIEW_TURN_SYSTEM,
  findQuestionMark,
  LAST_ANSWER_NOTE,
  openingPrompt,
  splitTurnMarker,
  splitTurnParts,
  type TurnParts,
} from '../utils/interview-turn.prompt';
import {
  askUserStep,
  attachAnswer,
  HEAD_BUFFER,
  type StreamedTurn,
} from '../utils/mock-interview';

@Injectable()
export class InterviewTurnService {
  private readonly logger = new Logger(InterviewTurnService.name);

  private readonly maxQuestions: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly sessions: MockInterviewService,
    config: ConfigService,
  ) {
    this.maxQuestions = config.get<number>('mockInterview.maxQuestions')!;
  }

  async openStream(
    userId: string,
    jobId: string,
    question?: string,
  ): Promise<{ runId: string; stream: AsyncGenerator<string> }> {
    const dossier = await this.sessions.buildContext(userId, jobId);
    if (!dossier) {
      throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);
    }

    await this.sessions.assertNoRunInFlight(userId);

    const run = await this.prisma.agentRun.create({
      data: {
        userId,
        workflow: 'interview',
        jobId,
        status: 'RUNNING',
        startedAt: new Date(),
        input: question ? { question } : {},
      },
    });

    const startedAt = Date.now();
    let textStream: AsyncIterable<string>;
    try {
      const prompt = openingPrompt(dossier, question);
      const { result } = await this.ai.streamText({
        system: INTERVIEW_TURN_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        modelId: fastModelChain(estimateTokens(INTERVIEW_TURN_SYSTEM, prompt))
          .modelId,
        context: { purpose: 'interview.open', userId },
      });
      textStream = result.textStream;
    } catch (error) {
      await this.failRun(userId, run.id, messageOf(error));
      throw error;
    }

    return {
      runId: run.id,
      stream: this.openTurn(userId, run.id, dossier, textStream, startedAt),
    };
  }

  private async failRun(
    userId: string,
    runId: string,
    error: string,
  ): Promise<void> {
    await this.prisma.agentRun.update({
      where: { id: runId, userId },
      data: { status: 'FAILED', error },
    });
  }

  private async *openTurn(
    userId: string,
    runId: string,
    dossier: string,
    textStream: AsyncIterable<string>,
    startedAt: number,
  ): AsyncGenerator<string> {
    const turn: StreamedTurn = { body: '', done: false };
    yield* this.pump(textStream, turn, true);

    const rawParts = splitTurnParts(turn.body);
    if (!rawParts.question) {
      await this.failRun(userId, runId, 'Model không trả về câu hỏi nào');
      throw new BadRequestException('Model không trả về nội dung nào.');
    }

    if (rawParts.feedback) {
      this.logger.warn(
        `Mở buổi ${runId} model bịa feedback lượt đầu (${rawParts.feedback.length} ký tự), đã bỏ.`,
      );
    }

    const messages: ModelMessage[] = [
      { role: 'user', content: dossier },
      { role: 'assistant', content: turn.body.trim() },
    ];

    await this.prisma.$transaction([
      this.prisma.agentStep.create({
        data: {
          runId,
          index: 0,
          text: '',
          ...askUserStep(rawParts.question),
          durationMs: Date.now() - startedAt,
        },
      }),
      this.prisma.agentRun.update({
        where: { id: runId, userId },
        data: {
          status: turn.done ? 'DONE' : 'WAITING_USER',
          question: turn.done ? null : rawParts.question,
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

  /** Một lượt của buổi luyện: `answer` là câu trả lời, `null` là ứng viên bấm kết thúc sớm; tới trần số câu thì cũng đóng buổi. */
  async *stream(
    userId: string,
    runId: string,
    answer: string | null,
  ): AsyncGenerator<string> {
    const run = await this.sessions.get(userId, runId);

    if (run.workflow !== 'interview') {
      throw new BadRequestException(
        'Chỉ buổi luyện phỏng vấn mới trả lời theo kiểu này.',
      );
    }
    if (run.status === 'RUNNING') {
      throw new BadRequestException(
        'Câu trả lời trước của buổi luyện này đang được xử lý, đợi một chút rồi gửi tiếp.',
      );
    }
    if (run.status !== 'WAITING_USER') {
      throw new BadRequestException(
        'Buổi luyện này không còn chờ câu trả lời. Tải lại trang để xem trạng thái mới nhất.',
      );
    }

    const previous = run.messages as ModelMessage[] | null;
    if (!Array.isArray(previous) || previous.length === 0) {
      throw new BadRequestException(
        'Buổi luyện chưa có hội thoại nào để nối tiếp.',
      );
    }

    const claimed = await this.prisma.agentRun.updateMany({
      where: { id: runId, userId, status: 'WAITING_USER' },
      data: { status: 'RUNNING' },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(
        'Câu trả lời trước của buổi luyện này đang được xử lý, không chờ câu trả lời nào.',
      );
    }

    const asked = await this.prisma.agentStep.count({ where: { runId } });
    const lastAnswer = asked >= this.maxQuestions;
    let content = FINISH_REQUEST;
    if (answer !== null) {
      content = lastAnswer ? `${answer}\n\n${LAST_ANSWER_NOTE}` : answer;
    }
    const messages: ModelMessage[] = [...previous, { role: 'user', content }];

    let persisted = false;
    try {
      const startedAt = Date.now();
      const { result } = await this.ai.streamText({
        system: INTERVIEW_TURN_SYSTEM,
        messages,
        modelId: fastModelChain(
          estimateTokens(INTERVIEW_TURN_SYSTEM, JSON.stringify(messages)),
        ).modelId,
        context: { purpose: 'interview.turn', userId },
      });

      const turn: StreamedTurn = { body: '', done: false };
      yield* this.pump(result.textStream, turn, false);
      const body = turn.body;
      const done = turn.done || answer === null || lastAnswer;

      const parts = splitTurnParts(body);
      if (!parts.question) {
        throw new BadRequestException('Model không trả về nội dung nào.');
      }
      if (!done && !findQuestionMark(body)) {
        throw new BadRequestException(
          'Lượt của người phỏng vấn bị ngắt giữa chừng. Câu trả lời của bạn chưa được ghi nhận, gửi lại giúp nhé.',
        );
      }

      await this.persist(
        userId,
        runId,
        answer,
        parts,
        done,
        Date.now() - startedAt,
        [...messages, { role: 'assistant', content: body.trim() }],
      );
      persisted = true;

      this.logger.log(
        `Lượt phỏng vấn ${runId} xong sau ${Date.now() - startedAt}ms, ${done ? 'kết thúc buổi' : 'còn hỏi tiếp'}`,
      );
      this.warnForeign(body);
    } finally {
      if (!persisted) {
        await this.prisma.agentRun.updateMany({
          where: { id: runId, userId, status: 'RUNNING' },
          data: { status: 'WAITING_USER' },
        });
      }
    }
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
      const mark = findQuestionMark(pending);
      if (!mark) return '';

      markerSeen = true;
      return scrub.push(pending.slice(mark.end));
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
        `Model chèn ${foreign} ký tự ngoài bảng Latin vào câu tiếng Việt, đã xoá. Đây là dấu hiệu model yếu cho tác vụ này - xem AI_FAST_MODEL_ID.`,
      );
    }
  }

  private async persist(
    userId: string,
    runId: string,
    answer: string | null,
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

    const answered =
      answer === null ? null : attachAnswer(previous?.toolResults, answer);

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
          ...(done
            ? { toolCalls: [], toolResults: [] }
            : askUserStep(parts.question)),
          durationMs,
        },
      }),
      this.prisma.agentRun.update({
        where: { id: runId, userId },
        data: {
          status: done ? 'DONE' : 'WAITING_USER',
          question: done ? null : parts.question,
          ...(done ? { result: { text: parts.question } } : {}),
          answer: null,
          messages: messages as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
  }
}
