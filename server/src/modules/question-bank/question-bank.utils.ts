import { OCCUPATIONS } from '../jobs/taxonomy/occupations.js';
import type { ListQuestionsQueryDto } from './question-bank.dto.js';

const OCCUPATION_NAMES = new Map(OCCUPATIONS.map((o) => [o.code, o.name]));

/** Loại câu hỏi KHÔNG được có đáp án mẫu: phải là trải nghiệm của chính ứng viên. */
export const NO_SAMPLE_ANSWER = new Set(['HANH_VI', 'DONG_CO']);

const TYPE_LABELS: Record<string, string> = {
  KIEN_THUC: 'Kiến thức',
  QUY_TRINH: 'Quy trình',
  HANH_VI: 'Hành vi',
  DONG_CO: 'Động cơ',
};

export const LIST_FIELDS = {
  id: true,
  text: true,
  industry: true,
  type: true,
  difficulty: true,
  answeredAt: true,
} as const;

export const occupationName = (code: string | null): string | null =>
  OCCUPATION_NAMES.get(code ?? '') ?? null;

export const typeLabel = (type: string | null): string | null =>
  TYPE_LABELS[type ?? ''] ?? null;

/** Bốn mảnh `where` rời, để `facets` ghép được từng chiều mà bỏ chính nó. */
export function questionFilters(query: ListQuestionsQueryDto = {}) {
  return {
    search: query.q
      ? { text: { contains: query.q, mode: 'insensitive' as const } }
      : {},
    industry: query.industry ? { industry: query.industry } : {},
    type: query.type ? { type: query.type } : {},
    difficulty: query.difficulty ? { difficulty: query.difficulty } : {},
  };
}

/** Gộp cả bốn mảnh thành một `where` đầy đủ. */
export function questionWhere(query: ListQuestionsQueryDto = {}) {
  const { search, industry, type, difficulty } = questionFilters(query);
  return {
    status: 'READY' as const,
    ...search,
    ...industry,
    ...type,
    ...difficulty,
  };
}

/** Thêm tên tiếng Việt và cờ được phép có đáp án mẫu cho một hàng. */
export function decorate<
  T extends { industry: string | null; type: string | null },
>(row: T) {
  return {
    ...row,
    industryName: occupationName(row.industry),
    typeName: typeLabel(row.type),
    canHaveSampleAnswer: !NO_SAMPLE_ANSWER.has(row.type ?? ''),
  };
}

/** Xếp giảm dần theo số lượng, dùng chung cho cả ba chiều của thanh lọc. */
export const byCount = <T extends { count: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => b.count - a.count);
