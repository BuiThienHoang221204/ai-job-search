import { z } from 'zod';

export const skillMergeSchema = z.object({
  decisions: z
    .array(
      z.object({
        term: z
          .number()
          .int()
          .describe(
            'Số thứ tự của chuỗi cần phân loại, lấy đúng trong đề bài.',
          ),
        match: z
          .number()
          .int()
          .describe(
            'Số thứ tự của ứng viên TRÙNG NGHĨA, hoặc 0 nếu không ứng viên nào là cùng một kỹ năng.',
          ),
      }),
    )
    .describe('Mỗi chuỗi trong đề bài đúng một phần tử, không bỏ sót.'),
});

export type SkillMerge = z.infer<typeof skillMergeSchema>;
