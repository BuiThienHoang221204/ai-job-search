import { z } from 'zod';
import {
  boundedList,
  requiredCappedTextVi,
} from '../../common/model-output.js';

const vn = (max: number, hint: string) => requiredCappedTextVi(max, hint);

/**
 * Phần đáp án sinh lười cho một câu hỏi trong ngân hàng.
 *
 * `sampleAnswer` là `nullable` chứ không optional, và đó là chủ đích: với câu
 * HANH_VI hoặc DONG_CO thì model PHẢI trả `null`. Nhưng schema không phải chốt
 * chặn duy nhất — `QuestionBankService` ép `null` lại một lần nữa ở tầng mã,
 * vì một câu chuyện bịa lưu sẵn trong ngân hàng sẽ dạy ứng viên đọc thuộc thứ
 * không phải của họ, rồi chính `unsupportedClaims` của mock interview gắn cờ nó
 * là tuyên bố không có bằng chứng.
 */
export const questionAnswerSchema = z.object({
  why: vn(400, 'Nhà tuyển dụng hỏi câu này để dò năng lực gì.'),
  keyPoints: boundedList(
    vn(220, 'Một ý mà câu trả lời tốt phải chạm tới.'),
    5,
  ).describe('3-5 ý chính.'),
  answerGuide: vn(900, 'Hướng dẫn cách trả lời: cấu trúc và hướng tiếp cận.'),
  sampleAnswer: z
    .string()
    .max(2000)
    .nullable()
    .catch(null)
    .describe(
      'Đáp án mẫu đầy đủ. BẮT BUỘC null với câu hỏi yêu cầu kể lại trải nghiệm hoặc động cơ của chính ứng viên.',
    ),
});

export type QuestionAnswerResult = z.infer<typeof questionAnswerSchema>;
