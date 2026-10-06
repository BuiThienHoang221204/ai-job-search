import { z } from 'zod';
import { requiredCappedTextVi } from '@/common/model-output';

const vn = (max: number, hint: string) => requiredCappedTextVi(max, hint);

export const gapCategory = z.enum(['domain', 'soft', 'tooling', 'credential']);

export const upskillGapsSchema = z.object({
  hardGaps: z
    .array(
      z.object({
        skill: vn(80, 'Tên kỹ năng còn thiếu.'),
        demandCount: z
          .number()
          .int()
          .min(0)
          .describe('Số công việc trong danh sách có yêu cầu kỹ năng này.'),
        priority: z
          .number()
          .int()
          .min(0)
          .max(100)
          .describe(
            'Độ ưu tiên 0-100. Càng nhiều công việc đòi hỏi và càng làm điểm phù hợp tụt xuống thì càng cao.',
          ),
        evidence: vn(
          500,
          'Công việc nào đòi hỏi kỹ năng này, dẫn chứng cụ thể.',
        ),
      }),
    )
    .transform((items) => items.slice(0, 12))
    .describe(
      'Kỹ năng kỹ thuật cụ thể mà tin tuyển dụng đòi hỏi nhưng hồ sơ chưa có.',
    ),

  synthesisedGaps: z
    .array(
      z.object({
        category: gapCategory,
        gap: vn(160, 'Khoảng trống không thể hiện ra qua danh sách kỹ năng.'),
        why: vn(
          500,
          'Vì sao điều này quan trọng với các vị trí ứng viên đang nhắm tới.',
        ),
      }),
    )
    .transform((items) => items.slice(0, 8))
    .describe(
      'Khoảng trống về kiến thức ngành, cách làm việc, công cụ/quy trình, hoặc chứng chỉ. Không lặp lại hardGaps.',
    ),
});

export const upskillPlanSchema = z.object({
  learningPlan: z
    .array(
      z.object({
        order: z.number().int().min(1).describe('Thứ tự học, bắt đầu từ 1.'),
        topic: vn(120, 'Chủ đề cần học.'),
        rationale: vn(500, 'Vì sao học cái này trước các cái khác.'),
        estimatedWeeks: z.number().int().min(1).max(52),
        resources: z
          .array(
            vn(
              300,
              'Nguồn học cụ thể: tên khóa học, sách, tài liệu chính thức.',
            ),
          )
          .min(1)
          .transform((items) => items.slice(0, 4)),
      }),
    )
    .min(1)
    .transform((items) => items.slice(0, 8))
    .describe(
      'Sắp theo thứ tự học, không phải theo độ quan trọng. Cái nào mở khóa được nhiều thứ khác thì học trước.',
    ),

  summary: vn(
    800,
    'Tóm tắt 2-3 câu: khoảng trống lớn nhất và nên bắt đầu từ đâu.',
  ),
});

export type UpskillGaps = z.infer<typeof upskillGapsSchema>;
export type UpskillPlan = z.infer<typeof upskillPlanSchema>;
