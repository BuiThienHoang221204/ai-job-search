import type { InterviewQuestionKind } from '@/generated/prisma/enums';
import { fingerprint } from '@/common/fingerprint';

export const ANSWER_KINDS = ['star', 'tough'] as const;
export type AnswerKindParam = (typeof ANSWER_KINDS)[number];

export const KIND_OF_PARAM: Record<AnswerKindParam, InterviewQuestionKind> = {
  star: 'STAR',
  tough: 'TOUGH',
};

export type PracticeQuestion = {
  kind: InterviewQuestionKind;
  index: number;
  question: string;
  key: string;
  hint: string;
};

type PrepContent = { starAnswers: unknown; toughQuestions: unknown };

type StoredAnswer = {
  questionKey: string;
  text: string;
  feedback: unknown;
  feedbackKey: string | null;
  updatedAt: Date;
};

const asRecords = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
    : [];

const textOf = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const questionKeyOf = (question: string): string =>
  fingerprint([question.trim()]);

export const answerKeyOf = (text: string): string => fingerprint([text.trim()]);

const STAR_PARTS: Array<[string, string]> = [
  ['situation', 'Bối cảnh'],
  ['task', 'Nhiệm vụ'],
  ['action', 'Hành động'],
  ['result', 'Kết quả'],
];

/** Mọi câu người dùng tự trả lời được trong một bộ đề, theo đúng thứ tự hiển thị. */
export function practiceQuestions(prep: PrepContent): PracticeQuestion[] {
  const star = asRecords(prep.starAnswers).map((item, index) => ({
    kind: 'STAR' as const,
    index,
    question: textOf(item.question),
    hint: STAR_PARTS.map(([field, label]) => `${label}: ${textOf(item[field])}`)
      .filter((line) => !line.endsWith(': '))
      .join('\n'),
  }));
  const tough = asRecords(prep.toughQuestions).map((item, index) => ({
    kind: 'TOUGH' as const,
    index,
    question: textOf(item.question),
    hint: [textOf(item.why), textOf(item.suggestedAnswer)]
      .filter(Boolean)
      .join('\n'),
  }));
  return [...star, ...tough]
    .filter((item) => item.question)
    .map((item) => ({ ...item, key: questionKeyOf(item.question) }));
}

export const findQuestion = (
  prep: PrepContent,
  kind: InterviewQuestionKind,
  index: number,
): PracticeQuestion | null =>
  practiceQuestions(prep).find(
    (item) => item.kind === kind && item.index === index,
  ) ?? null;

export const answerView = (answer: StoredAnswer) => ({
  text: answer.text,
  feedback: answer.feedback ?? null,
  feedbackStale:
    answer.feedback != null && answer.feedbackKey !== answerKeyOf(answer.text),
  updatedAt: answer.updatedAt,
});

/** Ghép câu trả lời đã lưu vào câu hỏi của bộ đề HIỆN TẠI; câu trả lời của câu đã bị soạn lại thì bỏ. */
export function readinessOf(prep: PrepContent, answers: StoredAnswer[]) {
  const byKey = new Map(answers.map((answer) => [answer.questionKey, answer]));
  const questions = practiceQuestions(prep);
  const matched = questions.flatMap((question) => {
    const answer = byKey.get(question.key);
    return answer && answer.text.trim()
      ? [{ kind: question.kind, index: question.index, ...answerView(answer) }]
      : [];
  });
  return {
    practiced: matched.length,
    total: questions.length,
    answers: matched,
  };
}
