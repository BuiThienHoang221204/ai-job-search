import { Injectable, NotFoundException } from '@nestjs/common';
import type { InterviewQuestionKind } from '@/generated/prisma/enums';
import { fastModelChain } from '@/modules/ai/utils/model-env';
import { PrismaService } from '@/prisma/prisma.service';
import { estimateTokens } from '@/common/ai/token-estimate';
import { AiService } from '../ai/services/ai.service';
import { PromptBuilderService } from '../skills/services/prompt-builder.service';
import { answerFeedbackSchema } from './interview.schema';
import {
  ANSWER_FEEDBACK_SYSTEM,
  buildAnswerFeedbackPrompt,
} from './utils/answer-feedback.prompt';
import {
  answerKeyOf,
  answerView,
  findQuestion,
  type PracticeQuestion,
} from './utils/interview-answers';

@Injectable()
export class InterviewAnswersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: PromptBuilderService,
  ) {}

  private async requireQuestion(
    userId: string,
    jobId: string,
    kind: InterviewQuestionKind,
    index: number,
  ): Promise<PracticeQuestion> {
    const prep = await this.prisma.interviewPrep.findUnique({
      where: { userId_jobId: { userId, jobId } },
      select: { status: true, starAnswers: true, toughQuestions: true },
    });
    if (prep?.status !== 'DONE') {
      throw new NotFoundException('Chưa soạn xong câu hỏi cho công việc này');
    }
    const question = findQuestion(prep, kind, index);
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi này');
    return question;
  }

  private upsertText(
    userId: string,
    jobId: string,
    question: PracticeQuestion,
    text: string,
  ) {
    return this.prisma.interviewAnswer.upsert({
      where: {
        userId_jobId_questionKey: { userId, jobId, questionKey: question.key },
      },
      create: {
        userId,
        jobId,
        questionKey: question.key,
        kind: question.kind,
        question: question.question,
        text,
      },
      update: { text },
    });
  }

  async save(
    userId: string,
    jobId: string,
    kind: InterviewQuestionKind,
    index: number,
    text: string,
  ) {
    const question = await this.requireQuestion(userId, jobId, kind, index);
    const trimmed = text.trim();

    if (!trimmed) {
      await this.prisma.interviewAnswer.deleteMany({
        where: { userId, jobId, questionKey: question.key },
      });
      return { kind, index, answer: null };
    }

    const answer = await this.upsertText(userId, jobId, question, trimmed);
    return { kind, index, answer: answerView(answer) };
  }

  async feedback(
    userId: string,
    jobId: string,
    kind: InterviewQuestionKind,
    index: number,
    text: string,
  ) {
    const question = await this.requireQuestion(userId, jobId, kind, index);
    const trimmed = text.trim();
    const [profile, job] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.job.findUnique({
        where: { id: jobId },
        select: { title: true, company: true, description: true },
      }),
    ]);
    if (!job) throw new NotFoundException(`Không tìm thấy công việc: ${jobId}`);

    await this.upsertText(userId, jobId, question, trimmed);

    const prompt = buildAnswerFeedbackPrompt({
      kind,
      question: question.question,
      hint: question.hint,
      answer: trimmed,
      profileSummary: this.prompts.profileSummary(profile),
      job,
    });
    const { object, modelId } = await this.ai.generateObject({
      schema: answerFeedbackSchema,
      context: { purpose: 'interview.feedback', userId },
      system: ANSWER_FEEDBACK_SYSTEM,
      prompt,
      ...fastModelChain(estimateTokens(ANSWER_FEEDBACK_SYSTEM, prompt)),
    });

    const answer = await this.prisma.interviewAnswer.update({
      where: {
        userId_jobId_questionKey: { userId, jobId, questionKey: question.key },
      },
      data: { feedback: object, feedbackKey: answerKeyOf(trimmed), modelId },
    });
    return { kind, index, answer: answerView(answer) };
  }
}
