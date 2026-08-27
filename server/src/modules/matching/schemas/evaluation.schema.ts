import { z } from 'zod';
import { boundedList, cappedTextVi } from '../../../common/model-output.js';

/**
 * Mô tả được gửi kèm JSON schema lên API, nên đây là nơi hiệu quả nhất để nêu
 * ràng buộc. Không có dòng .describe() này, model free chấm theo thang 0-5
 * rồi trả về 4 - hợp lệ với kiểu dữ liệu nhưng sai hoàn toàn về ý nghĩa.
 */
const score = z
  .number()
  .int()
  .min(0)
  .max(100)
  .describe(
    'Điểm trên thang 0-100. Ví dụ hợp lệ: 85, 62, 40. TUYỆT ĐỐI không dùng thang 0-5 hay 0-10.',
  );

const note = cappedTextVi(
  600,
  'Giải thích ngắn bằng tiếng Việt có dấu, 1-2 câu, nêu bằng chứng cụ thể từ hồ sơ và tin tuyển dụng.',
).default('');

/**
 * Cấu trúc kết quả chấm điểm, dịch nguyên từ
 * .claude/skills/job-application-assistant/04-job-evaluation.md.
 */
export const evaluationSchema = z.object({
  /** Công đoạn chạy TRƯỚC khi chấm điểm. Nếu FAIL thì các chiều dưới bị bỏ qua. */
  eligibility: z.object({
    verdict: z.enum(['PASS', 'FAIL', 'UNVERIFIED']),
    /**
     * Trích nguyên văn câu chữ trong tin tuyển dụng dẫn tới kết luận. Để
     * trống nếu tin không nói gì về quốc tịch / quyền làm việc.
     */
    quote: cappedTextVi(
      600,
      'Trích nguyên văn câu chữ trong tin về quốc tịch hoặc quyền làm việc.',
    ).default(''),
    note: note,
  }),

  technical: z.object({ score, note }),
  experience: z.object({ score, note }),
  behavioral: z.object({ score, note }),
  career: z.object({ score, note }),

  /** Location là PASS/FAIL, không tính vào điểm có trọng số. */
  location: z.object({
    pass: z.boolean().catch(false).default(false),
    note: note,
  }),

  strengths: z
    .array(cappedTextVi(300, 'Một thế mạnh, viết thành câu hoàn chỉnh.'))
    .min(1)
    .describe(
      '2-4 thế mạnh cụ thể của ứng viên cho ĐÚNG vị trí này, mỗi ý một câu tiếng Việt hoàn chỉnh.',
    )
    .transform((items) => items.filter((t) => t.length > 0).slice(0, 6)),
  gaps: boundedList(
    cappedTextVi(300, 'Một khoảng trống, viết thành câu hoàn chỉnh.'),
    6,
  )
    .describe(
      'Các yêu cầu của tin tuyển dụng mà hồ sơ chưa đáp ứng, mỗi ý một câu tiếng Việt hoàn chỉnh.',
    )
    .default([]),
  recommendation: cappedTextVi(
    800,
    '1-2 câu tiếng Việt: nên ứng tuyển, nên bỏ qua, hay ứng tuyển kèm lưu ý gì.',
  ).default(''),
});

export type Evaluation = z.infer<typeof evaluationSchema>;

/** Trọng số lấy từ mục "Weighting" của 04-job-evaluation.md. */
export const WEIGHTS = {
  technical: 0.3,
  experience: 0.25,
  behavioral: 0.15,
  career: 0.3,
} as const;

/** Điểm tổng được tính ở server chứ không hỏi model. */
export const computeOverall = (evaluation: Evaluation): number =>
  Math.round(
    evaluation.technical.score * WEIGHTS.technical +
      evaluation.experience.score * WEIGHTS.experience +
      evaluation.behavioral.score * WEIGHTS.behavioral +
      evaluation.career.score * WEIGHTS.career,
  );

export type FitVerdictValue = 'STRONG' | 'GOOD' | 'MODERATE' | 'WEAK' | 'POOR';

/** Ngưỡng lấy từ mục "Thresholds" của 04-job-evaluation.md. */
export const verdictFor = (overall: number): FitVerdictValue => {
  if (overall >= 75) return 'STRONG';
  if (overall >= 60) return 'GOOD';
  if (overall >= 45) return 'MODERATE';
  if (overall >= 30) return 'WEAK';
  return 'POOR';
};
