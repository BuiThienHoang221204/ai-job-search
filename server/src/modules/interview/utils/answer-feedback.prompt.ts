import type { InterviewQuestionKind } from '@/generated/prisma/enums';

export const JOB_DESCRIPTION_LIMIT = 4000;

export const ANSWER_FEEDBACK_SYSTEM = [
  'Bạn là huấn luyện viên phỏng vấn. Ứng viên vừa tự trả lời một câu hỏi luyện tập; hãy nhận xét ngắn gọn để họ sửa được ngay.',
  '',
  'Quy tắc bắt buộc:',
  '- Câu loại STAR: kiểm đủ bốn phần Bối cảnh, Nhiệm vụ (của riêng ứng viên, không phải của cả nhóm), Hành động, Kết quả đo được. Nói rõ phần nào đã có, phần nào thiếu.',
  '- Câu hỏi khó: kiểm ứng viên có thừa nhận thật rồi bắc cầu sang kinh nghiệm liên quan không, có né câu hỏi hay tự hạ thấp mình không.',
  '- Chỉ gợi ý con số, dự án, công cụ CÓ trong hồ sơ ứng viên. Tuyệt đối không bịa kinh nghiệm cho họ.',
  '- Gợi ý tham khảo chỉ để biết hướng tốt; đừng đòi ứng viên chép lại nó.',
  '- Không chấm điểm, không khen chung chung. Viết tiếng Việt có dấu.',
].join('\n');

export type AnswerFeedbackInput = {
  kind: InterviewQuestionKind;
  question: string;
  hint: string;
  answer: string;
  profileSummary: string;
  job: { title: string; company: string; description: string };
};

export function buildAnswerFeedbackPrompt(input: AnswerFeedbackInput): string {
  return [
    '=== VỊ TRÍ ỨNG TUYỂN ===',
    `Chức danh: ${input.job.title}`,
    `Công ty: ${input.job.company}`,
    'Mô tả:',
    input.job.description.slice(0, JOB_DESCRIPTION_LIMIT),
    '',
    '=== HỒ SƠ ỨNG VIÊN ===',
    input.profileSummary,
    '',
    `=== CÂU HỎI (${input.kind === 'STAR' ? 'STAR' : 'câu hỏi khó'}) ===`,
    input.question,
    '',
    '=== GỢI Ý THAM KHẢO ===',
    input.hint || '(không có)',
    '',
    '=== CÂU TRẢ LỜI CỦA ỨNG VIÊN ===',
    input.answer,
  ].join('\n');
}
