import { z } from 'zod';

/**
 * Model trả lời bằng SỐ THỨ TỰ, không bằng tên kỹ năng.
 *
 * Cho nó tự viết lại tên là mở đường cho một chuỗi gần đúng nhưng không tồn tại
 * trong danh sách — cùng lý do `resolveSources` của module companies bắt model
 * khai nguồn bằng số.
 */
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
