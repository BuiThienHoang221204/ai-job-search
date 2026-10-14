import {
  answerKeyOf,
  findQuestion,
  practiceQuestions,
  questionKeyOf,
  readinessOf,
} from 'src/modules/interview/utils/interview-answers.js';
import {
  buildAnswerFeedbackPrompt,
  JOB_DESCRIPTION_LIMIT,
} from 'src/modules/interview/utils/answer-feedback.prompt.js';

const star = (question: string) => ({
  competency: 'Giải quyết vấn đề',
  question,
  situation: 'Hệ thống thanh toán chậm.',
  task: 'Tôi phụ trách tối ưu.',
  action: 'Thêm index và cache.',
  result: 'Thời gian phản hồi giảm 60%.',
});

const tough = (question: string) => ({
  question,
  why: 'Hồ sơ chưa có Kubernetes.',
  suggestedAnswer: 'Thừa nhận rồi bắc cầu sang Docker.',
});

const prep = {
  starAnswers: [
    star('Kể về một lần tối ưu hệ thống?'),
    star('Kể về xung đột?'),
  ],
  toughQuestions: [tough('Bạn chưa dùng Kubernetes?')],
};

const stored = (question: string, text: string, feedbackFor?: string) => ({
  questionKey: questionKeyOf(question),
  text,
  feedback: feedbackFor ? { summary: 'Ổn', improvements: [] } : null,
  feedbackKey: feedbackFor ? answerKeyOf(feedbackFor) : null,
  updatedAt: new Date('2026-10-14T00:00:00Z'),
});

describe('practiceQuestions', () => {
  test('gồm câu STAR rồi câu hỏi khó, đánh số riêng theo từng loại', () => {
    const questions = practiceQuestions(prep);

    expect(
      questions.map(({ kind, index, question }) => [kind, index, question]),
    ).toEqual([
      ['STAR', 0, 'Kể về một lần tối ưu hệ thống?'],
      ['STAR', 1, 'Kể về xung đột?'],
      ['TOUGH', 0, 'Bạn chưa dùng Kubernetes?'],
    ]);
  });

  test('gợi ý STAR ghép đủ bốn phần có nhãn', () => {
    const [first] = practiceQuestions(prep);

    expect(first.hint).toBe(
      'Bối cảnh: Hệ thống thanh toán chậm.\nNhiệm vụ: Tôi phụ trách tối ưu.\nHành động: Thêm index và cache.\nKết quả: Thời gian phản hồi giảm 60%.',
    );
  });

  test('dữ liệu hỏng hoặc thiếu câu hỏi thì bỏ qua, không ném', () => {
    expect(
      practiceQuestions({
        starAnswers: [null, 'chuỗi', { question: '' }],
        toughQuestions: null,
      }),
    ).toEqual([]);
  });

  test('findQuestion trả null cho số thứ tự ngoài bộ đề', () => {
    expect(findQuestion(prep, 'TOUGH', 0)?.question).toBe(
      'Bạn chưa dùng Kubernetes?',
    );
    expect(findQuestion(prep, 'TOUGH', 1)).toBeNull();
  });
});

describe('readinessOf', () => {
  test('đếm câu đã tự trả lời trên tổng số câu STAR + câu hỏi khó', () => {
    const readiness = readinessOf(prep, [
      stored('Kể về xung đột?', 'Tôi từng bất đồng với PM...'),
    ]);

    expect(readiness).toMatchObject({ practiced: 1, total: 3 });
    expect(readiness.answers[0]).toMatchObject({ kind: 'STAR', index: 1 });
  });

  /// Khoá theo chữ câu hỏi chứ không theo vị trí: soạn lại bộ đề thì câu trả lời cũ không được gắn nhầm sang câu mới đứng cùng chỗ.
  test('soạn lại bộ đề thì câu trả lời của câu đã đổi không còn được tính', () => {
    const regenerated = {
      ...prep,
      starAnswers: [star('Câu hỏi hoàn toàn mới?'), star('Kể về xung đột?')],
    };

    const readiness = readinessOf(regenerated, [
      stored('Kể về một lần tối ưu hệ thống?', 'Câu trả lời cũ'),
    ]);

    expect(readiness).toMatchObject({ practiced: 0, total: 3, answers: [] });
  });

  test('nhận xét đã cũ khi người dùng sửa câu trả lời sau lần nhận xét', () => {
    const [fresh] = readinessOf(prep, [
      stored('Kể về xung đột?', 'Bản đã nhận xét', 'Bản đã nhận xét'),
    ]).answers;
    const [stale] = readinessOf(prep, [
      stored('Kể về xung đột?', 'Bản đã sửa', 'Bản đã nhận xét'),
    ]).answers;

    expect(fresh.feedbackStale).toBe(false);
    expect(stale.feedbackStale).toBe(true);
  });
});

describe('buildAnswerFeedbackPrompt', () => {
  test('mang câu hỏi, gợi ý và câu trả lời; cắt mô tả tin quá dài', () => {
    const prompt = buildAnswerFeedbackPrompt({
      kind: 'TOUGH',
      question: 'Bạn chưa dùng Kubernetes?',
      hint: 'Bắc cầu sang Docker.',
      answer: 'Tôi đã dùng Docker Compose hai năm.',
      profileSummary: 'Kỹ năng chính: Docker',
      job: {
        title: 'DevOps',
        company: 'Công ty A',
        description: 'x'.repeat(JOB_DESCRIPTION_LIMIT + 500),
      },
    });

    expect(prompt).toContain('=== CÂU HỎI (câu hỏi khó) ===');
    expect(prompt).toContain('Tôi đã dùng Docker Compose hai năm.');
    expect(prompt).toContain('Bắc cầu sang Docker.');
    expect(prompt).not.toContain('x'.repeat(JOB_DESCRIPTION_LIMIT + 1));
  });
});
