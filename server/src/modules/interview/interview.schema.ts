import { z } from 'zod';
import { requiredCappedTextVi } from '../../common/model-output.js';

const vn = (max: number, hint: string) => requiredCappedTextVi(max, hint);

/**
 * Cấu trúc bộ câu hỏi phỏng vấn, dịch từ
 * .claude/skills/job-application-assistant/07-interview-prep.md.
 */
export const interviewPrepSchema = z.object({
  /** File skill quy định dùng khung STAR: Situation - Task - Action - Result. */
  starAnswers: z
    .array(
      z.object({
        competency: vn(120, 'Năng lực mà câu chuyện này chứng minh.'),
        question: vn(200, 'Câu hỏi nhà tuyển dụng nhiều khả năng sẽ hỏi.'),
        situation: vn(500, 'Bối cảnh: chuyện gì đang diễn ra, vấn đề là gì.'),
        task: vn(400, 'Trách nhiệm cụ thể của ứng viên trong tình huống đó.'),
        action: vn(600, 'Ứng viên đã làm gì: hành động, công cụ, phương pháp.'),
        result: vn(400, 'Kết quả đo được. Nêu con số nếu hồ sơ có.'),
      }),
    )
    .min(2)
    .transform((items) => items.slice(0, 5))
    .describe(
      'Các câu chuyện theo khung STAR, DÙNG từ kinh nghiệm có thật trong hồ sơ. Không bịa dự án.',
    ),

  toughQuestions: z
    .array(
      z.object({
        question: vn(250, 'Câu hỏi khó.'),
        why: vn(300, 'Vì sao nhà tuyển dụng hỏi câu này ở vị trí này.'),
        suggestedAnswer: vn(
          700,
          'Hướng trả lời: thừa nhận thật, bắc cầu sang kinh nghiệm liên quan.',
        ),
      }),
    )
    .min(2)
    .transform((items) => items.slice(0, 6))
    .describe(
      'Ưu tiên các câu đào vào khoảng trống thật giữa hồ sơ và yêu cầu tin tuyển dụng.',
    ),

  questionsToAsk: z
    .array(vn(220, 'Câu ứng viên nên hỏi lại nhà tuyển dụng.'))
    .min(3)
    .transform((items) => items.slice(0, 8))
    .describe(
      'Câu hỏi cụ thể cho công ty và vị trí này, không phải câu hỏi chung chung.',
    ),

  talkingPoints: z
    .array(vn(220, 'Ý chính cần chủ động nhắc đến trong buổi phỏng vấn.'))
    .min(2)
    .transform((items) => items.slice(0, 6)),

  likelyProbes: z
    .array(vn(220, 'Điểm yếu nhà tuyển dụng nhiều khả năng sẽ đào sâu.'))
    .transform((items) => items.slice(0, 6))
    .describe(
      'Các chỗ hồ sơ còn mỏng so với yêu cầu, để ứng viên chuẩn bị trước.',
    ),
});

export type InterviewPrepResult = z.infer<typeof interviewPrepSchema>;
