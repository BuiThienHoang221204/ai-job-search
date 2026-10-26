import { z } from 'zod';
import { boundedInt, boundedList, cappedText } from '@/common/model-output';

export const skillImpliesSchema = z.object({
  skills: z
    .array(
      z.object({
        index: boundedInt(
          1,
          50,
          'Số thứ tự của kỹ năng, ĐÚNG như trong đề bài.',
        ),
        implies: boundedList(
          cappedText(60, 'Tên một kỹ năng được kéo theo, 1-4 từ.'),
          8,
        ).describe(
          'Kỹ năng mà ai có kỹ năng này chắc chắn cũng đáp ứng. Rỗng nếu không có gì chắc chắn.',
        ),
      }),
    )
    .describe('Mỗi kỹ năng trong đề bài đúng một phần tử, không bỏ sót.'),
});

export type SkillImplies = z.infer<typeof skillImpliesSchema>;
