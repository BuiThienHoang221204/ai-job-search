import { z } from 'zod';
import { cappedText } from '@/common/model-output';

export const jobFromUrlSchema = z.object({
  company: cappedText(300, 'Tên công ty tuyển dụng, đúng như trang viết.'),
  title: cappedText(300, 'Chức danh của vị trí đang tuyển.'),
  description: cappedText(
    60_000,
    'Toàn bộ phần mô tả công việc, yêu cầu và quyền lợi. Giữ nguyên văn, không tóm tắt, không thêm lời bình.',
  ),
});

export type JobFromUrl = z.infer<typeof jobFromUrlSchema>;
