import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiService } from '../ai/services/ai.service.js';
import { DEFAULT_PAGE_SIZE } from '../../common/dto/pagination.dto.js';
import { OCCUPATIONS } from '../jobs/taxonomy/occupations.js';
import type { ListQuestionsQueryDto } from './question-bank.dto.js';
import {
  questionAnswerSchema,
  type QuestionAnswerResult,
} from './question-bank.schema.js';

const OCCUPATION_NAMES = new Map(OCCUPATIONS.map((o) => [o.code, o.name]));

/**
 * Loại câu hỏi KHÔNG được phép có đáp án mẫu: câu trả lời phải là trải nghiệm
 * hoặc động cơ của chính ứng viên.
 */
const NO_SAMPLE_ANSWER = new Set(['HANH_VI', 'DONG_CO']);

const TYPE_LABELS: Record<string, string> = {
  KIEN_THUC: 'Kiến thức',
  QUY_TRINH: 'Quy trình',
  HANH_VI: 'Hành vi',
  DONG_CO: 'Động cơ',
};

const LIST_FIELDS = {
  id: true,
  text: true,
  industry: true,
  type: true,
  difficulty: true,
  answeredAt: true,
} as const;

/**
 * Ngân hàng câu hỏi phỏng vấn tĩnh.
 *
 * Chỉ đọc bản ghi `READY`. `RAW` là câu chưa qua lượt dịch và phân loại, `REJECTED`
 * là thứ cổng `isQuestion` đã loại — cả hai đều không có đường nào lộ ra web.
 *
 * Phần đáp án sinh LƯỜI: đường đọc không gọi model, chỉ `ensureAnswer` mới gọi và
 * chỉ khi câu đó chưa từng có ai mở. Đo trên kho nguồn thì 91% câu chưa ai luyện
 * lần nào, nên sinh sẵn toàn bộ là trả tiền cho thứ không ai xem.
 */
@Injectable()
export class QuestionBankService {
  private readonly logger = new Logger(QuestionBankService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Số câu theo ngành, loại và độ khó — để thanh lọc hiện được số đếm.
   *
   * Mỗi chiều đếm theo các bộ lọc KHÁC đang bật, KHÔNG theo chính nó. Đang chọn
   * "Hành vi" thì số bên cạnh mỗi ngành phải là số câu hành vi của ngành đó;
   * còn hàng "Loại câu hỏi" vẫn hiện đủ bốn loại với số của chúng, nếu không thì
   * ba loại kia rơi về 0 và người dùng không đổi lựa chọn được nữa.
   *
   * Bản đầu đếm một lần trên toàn kho rồi đứng yên, nên bật bộ lọc nào thì các
   * con số cũng không nhúc nhích — trông y như số bị tính sai.
   */
  async facets(query: ListQuestionsQueryDto = {}) {
    const search = query.q
      ? { text: { contains: query.q, mode: 'insensitive' as const } }
      : {};
    const industry = query.industry ? { industry: query.industry } : {};
    const type = query.type ? { type: query.type } : {};
    const difficulty = query.difficulty ? { difficulty: query.difficulty } : {};
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
      this.prisma.interviewQuestion.count({
        where: { ...base, ...industry, ...type, ...difficulty },
      }),
    ]);

    return {
      total,
      industries: byIndustry
        .map((row) => ({
          code: row.industry as string,
          name: OCCUPATION_NAMES.get(row.industry as string) ?? row.industry,
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      types: byType
        .map((row) => ({
          code: row.type as string,
          name: TYPE_LABELS[row.type as string] ?? row.type,
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      difficulties: byDifficulty
        .map((row) => ({
          name: row.difficulty as string,
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  async list(query: ListQuestionsQueryDto) {
    const where = {
      status: 'READY' as const,
      ...(query.industry ? { industry: query.industry } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.q
        ? { text: { contains: query.q, mode: 'insensitive' as const } }
        : {}),
    };

    const take = query.limit ?? DEFAULT_PAGE_SIZE;
    const skip = query.offset ?? 0;

    const [items, total] = await Promise.all([
      this.prisma.interviewQuestion.findMany({
        where,
        select: LIST_FIELDS,
        orderBy: [{ sourcePracticeCount: 'desc' }, { id: 'asc' }],
        take,
        skip,
      }),
      this.prisma.interviewQuestion.count({ where }),
    ]);

    return {
      total,
      limit: take,
      offset: skip,
      items: items.map((row) => this.decorate(row)),
    };
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
    return this.decorate(row);
  }

  /**
   * Trả về câu hỏi kèm đáp án, sinh nếu chưa có.
   *
   * Đã có `answeredAt` thì KHÔNG gọi model lần nữa — đó là toàn bộ điểm của
   * việc sinh lười: người đầu tiên trả giá chờ, mọi người sau đọc từ database.
   */
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
    const system = [
      'Bạn là chuyên gia tuyển dụng người Việt, soạn nội dung cho ngân hàng câu hỏi phỏng vấn dùng ở thị trường Việt Nam.',
      'Viết toàn bộ bằng tiếng Việt, không dùng markdown trong các trường văn bản.',
      noSample
        ? 'Câu hỏi này yêu cầu ứng viên kể lại trải nghiệm hoặc động cơ của chính họ, nên sampleAnswer BẮT BUỘC là null. Tuyệt đối không bịa ra một câu chuyện cá nhân.'
        : 'sampleAnswer là đáp án mẫu đầy đủ 4-8 câu, viết như một ứng viên giỏi đang trả lời.',
    ].join('\n');

    const prompt = [
      `Câu hỏi: ${row.text}`,
      `Nhóm ngành: ${OCCUPATION_NAMES.get(row.industry ?? '') ?? 'không rõ'}`,
    ].join('\n');

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

  private decorate<T extends { industry: string | null; type: string | null }>(
    row: T,
  ) {
    return {
      ...row,
      industryName: OCCUPATION_NAMES.get(row.industry ?? '') ?? null,
      typeName: TYPE_LABELS[row.type ?? ''] ?? null,
      canHaveSampleAnswer: !NO_SAMPLE_ANSWER.has(row.type ?? ''),
    };
  }
}
