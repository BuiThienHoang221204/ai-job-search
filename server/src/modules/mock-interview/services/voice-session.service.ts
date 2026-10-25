import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ModelMessage } from 'ai';
import type { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { daysAgo, MINUTE_MS } from '@/common/duration';
import type { VoiceTurnDto } from '../mock-interview.dto';
import { askUserStep, attachAnswer } from '../utils/mock-interview';
import {
  isVoiceRun,
  VOICE_MODE,
  voiceMinutesUsed,
  voiceOpening,
  voiceSetup,
  voiceTurnMessages,
} from '../utils/voice-interview';
import { ReferralsService } from '@/modules/referrals/referrals.service';
import { LiveTokenService } from './live-token.service';
import { MockInterviewService } from './mock-interview.service';

const MIN_SESSION_MINUTES = 3;

type VoiceConfig = {
  model: string;
  voiceName: string;
  sessionMinutes: number;
  dailyMinutes: number;
};

@Injectable()
export class VoiceSessionService {
  private readonly voice: VoiceConfig;

  private readonly maxQuestions: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: MockInterviewService,
    private readonly tokens: LiveTokenService,
    private readonly referrals: ReferralsService,
    config: ConfigService,
  ) {
    this.voice = config.get<VoiceConfig>('mockInterview.voice')!;
    this.maxQuestions = config.get<number>('mockInterview.maxQuestions')!;
  }

  async open(userId: string, jobId: string) {
    const dossier = await this.sessions.buildContext(userId, jobId);
    if (!dossier) {
      throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);
    }

    await this.sessions.assertNoRunInFlight(userId);

    const now = new Date();
    const recent = await this.prisma.agentRun.findMany({
      where: {
        userId,
        createdAt: { gte: daysAgo(1, now.getTime()) },
        input: { path: ['mode'], equals: VOICE_MODE },
      },
      select: { status: true, startedAt: true, updatedAt: true, input: true },
    });
    const left = Math.max(
      0,
      this.voice.dailyMinutes - voiceMinutesUsed(recent, now),
    );
    const bonusLeft = await this.referrals.bonusLeft(userId);
    if (left + bonusLeft < MIN_SESSION_MINUTES) {
      throw new BadRequestException(
        `Bạn đã luyện phỏng vấn bằng giọng nói đủ ${this.voice.dailyMinutes} phút trong 24 giờ qua. Luyện bằng chữ ngay bây giờ, quay lại sau, hoặc mời bạn bè ở trang Tài khoản để được thêm phút.`,
      );
    }

    const minutes = Math.floor(
      Math.min(this.voice.sessionMinutes, left + bonusLeft),
    );
    const bonus = Math.max(0, minutes - Math.floor(left));
    const expiresAt = new Date(now.getTime() + minutes * MINUTE_MS);
    const token = await this.tokens.create(
      voiceSetup(dossier, {
        model: this.voice.model,
        voiceName: this.voice.voiceName,
        maxQuestions: this.maxQuestions,
      }),
      expiresAt,
    );

    const run = await this.prisma.agentRun.create({
      data: {
        userId,
        workflow: 'interview',
        jobId,
        status: 'WAITING_USER',
        startedAt: now,
        modelId: this.voice.model,
        input: { mode: VOICE_MODE, minutes, bonus },
        messages: [{ role: 'user', content: voiceOpening(dossier) }],
      },
      select: { id: true },
    });

    return { runId: run.id, token, model: this.voice.model, expiresAt };
  }

  async appendTurn(userId: string, runId: string, turn: VoiceTurnDto) {
    const run = await this.sessions.get(userId, runId);
    if (!isVoiceRun(run.input)) {
      throw new BadRequestException(
        'Buổi luyện này không phải buổi luyện bằng giọng nói.',
      );
    }
    if (run.status !== 'WAITING_USER') {
      throw new BadRequestException(
        'Buổi luyện này không còn nhận câu trả lời. Tải lại trang để xem trạng thái mới nhất.',
      );
    }

    const claimed = await this.prisma.agentRun.updateMany({
      where: { id: runId, userId, status: 'WAITING_USER' },
      data: { status: 'RUNNING' },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(
        'Câu trả lời trước của buổi luyện này đang được lưu, đợi một chút rồi gửi tiếp.',
      );
    }

    let saved = false;
    try {
      const [fresh, answered] = await Promise.all([
        this.prisma.agentRun.findUniqueOrThrow({
          where: { id: runId },
          select: { messages: true },
        }),
        this.prisma.agentStep.count({ where: { runId } }),
      ]);
      if (answered >= this.maxQuestions) {
        throw new BadRequestException(
          `Buổi luyện đã đủ ${this.maxQuestions} câu. Bấm kết thúc để nhận lời tổng kết.`,
        );
      }

      const step = askUserStep(turn.question);
      const messages: ModelMessage[] = [
        ...(fresh.messages as ModelMessage[]),
        ...voiceTurnMessages(turn.question, turn.answer),
      ];
      await this.prisma.$transaction([
        this.prisma.agentStep.create({
          data: {
            runId,
            index: answered,
            text: '',
            toolCalls: step.toolCalls,
            toolResults: attachAnswer(step.toolResults, turn.answer)!,
            durationMs: 0,
          },
        }),
        this.prisma.agentRun.update({
          where: { id: runId, userId },
          data: {
            status: 'WAITING_USER',
            messages: messages as unknown as Prisma.InputJsonValue,
          },
        }),
      ]);
      saved = true;
      return { answered: answered + 1 };
    } finally {
      if (!saved) {
        await this.prisma.agentRun.updateMany({
          where: { id: runId, userId, status: 'RUNNING' },
          data: { status: 'WAITING_USER' },
        });
      }
    }
  }
}
