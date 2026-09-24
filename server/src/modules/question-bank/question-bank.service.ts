import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/services/ai.service.js';
import { pageArgs, pageOf } from '../../common/pagination.js';
import type { ListQuestionsQueryDto } from './question-bank.dto.js';
import {
  questionAnswerPrompt,
  questionAnswerSystem,
} from './question-answer.prompt.js';
import {
  questionAnswerSchema,
  type QuestionAnswerResult,
} from './question-bank.schema.js';
import {
  byCount,
  decorate,
  LIST_FIELDS,
  NO_SAMPLE_ANSWER,
  occupationName,
  questionFilters,
  questionWhere,
  typeLabel,
} from './question-bank.utils.js';

/** Ngân hàng câu hỏi tĩnh. Chỉ đọc `READY`; đáp án sinh LƯỜI, 91% câu chưa ai mở. */
@Injectable()
export class QuestionBankService {
  private readonly logger = new Logger(QuestionBankService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /** Mỗi chiều đếm theo các bộ lọc KHÁC đang bật, không theo chính nó. */
  async facets(query: ListQuestionsQueryDto = {}) {
    const { search, industry, type, difficulty } = questionFilters(query);
    const base = { status: 'READY' as const, ...search };

    const [byIndustry, byType, byDifficulty, total] = await Promise.all([
      this.prisma.interviewQuestion.groupBy({
        by: ['industry'],
        where: { ...base, ...type, ...difficulty, industry: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.interviewQuestion.groupBy({
        by: ['type'],
        where: { ...base, ...industry, ...difficulty, type: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.interviewQuestion.groupBy({
        by: ['difficulty'],
        where: { ...base, ...industry, ...type, difficulty: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.interviewQuestion.count({ where: questionWhere(query) }),
    ]);

    return {
      total,
      industries: byCount(
        byIndustry.map((row) => ({
          code: row.industry as string,
          name: occupationName(row.industry) ?? row.industry,
          count: row._count._all,
        })),
      ),
      types: byCount(
        byType.map((row) => ({
          code: row.type as string,
          name: typeLabel(row.type) ?? row.type,
          count: row._count._all,
        })),
      ),
      difficulties: byCount(
        byDifficulty.map((row) => ({
          name: row.difficulty as string,
          count: row._count._all,
        })),
      ),
    };
  }

  async list(query: ListQuestionsQueryDto) {
    const where = questionWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.interviewQuestion.findMany({
        where,
        select: LIST_FIELDS,
        orderBy: [{ sourcePracticeCount: 'desc' }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.interviewQuestion.count({ where }),
    ]);

    return pageOf(items.map(decorate), total, query);
  }

  async get(id: string) {
    const row = await this.prisma.interviewQuestion.findFirst({
      where: { id, status: 'READY' },
      select: {
        ...LIST_FIELDS,
        why: true,
        keyPoints: true,
        answerGuide: true,
        sampleAnswer: true,
        verified: true,
      },
    });
    if (!row) throw new NotFoundException(`Không tìm thấy câu hỏi: ${id}`);
    return decorate(row);
  }

  /** Đã có `answeredAt` thì KHÔNG gọi model lần nữa - đó là điểm của sinh lười. */
  async ensureAnswer(id: string, userId: string) {
    const row = await this.prisma.interviewQuestion.findFirst({
      where: { id, status: 'READY' },
      select: {
        id: true,
        text: true,
        industry: true,
        type: true,
        answeredAt: true,
      },
    });
    if (!row) throw new NotFoundException(`Không tìm thấy câu hỏi: ${id}`);
    if (row.answeredAt) return this.get(id);

    const noSample = NO_SAMPLE_ANSWER.has(row.type ?? '');
    const system = questionAnswerSystem(noSample);
    const prompt = questionAnswerPrompt(
      row.text,
      occupationName(row.industry) ?? null,
    );

    const { object, modelId } =
      await this.ai.generateObject<QuestionAnswerResult>({
        schema: questionAnswerSchema,
        context: { purpose: 'question.answer', userId },
        system,
        prompt,
      });

    await this.prisma.interviewQuestion.update({
      where: { id },
      data: {
        why: object.why,
        keyPoints: object.keyPoints,
        answerGuide: object.answerGuide,
        sampleAnswer: noSample ? null : object.sampleAnswer,
        answeredAt: new Date(),
        modelId,
        verified: false,
      },
    });

    this.logger.log(`Đã sinh đáp án cho câu hỏi ${id} bằng ${modelId}`);
    return this.get(id);
  }
}
