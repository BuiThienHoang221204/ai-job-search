import { z } from 'zod';
import { cappedText, cappedTextVi } from '@/common/model-output';

const PLAN_MAX_ITEMS = 12;

export const planSchema = z.object({
  items: z
    .array(
      z.object({
        skill: cappedText(80, 'Tên kỹ năng, đúng như đầu vào.'),
        how: cappedTextVi(
          300,
          'Cách bổ sung kỹ năng này: ngắn gọn, tổng quát, thực tế. KHÔNG bịa tên khoá học, đường link, con số giờ học hay giá.',
        ),
      }),
    )
    .transform((items) => items.slice(0, PLAN_MAX_ITEMS)),
});

export type UpskillPlan = z.infer<typeof planSchema>;

export function planPrompt(skills: string[]): {
  system: string;
  prompt: string;
} {
  const system = [
    'Bạn gợi ý cách BỔ SUNG những kỹ năng một ứng viên còn thiếu cho một tin tuyển dụng.',
    'Mỗi kỹ năng: một câu ngắn, tổng quát, thực tế — học qua đâu, luyện thế nào.',
    'TUYỆT ĐỐI không bịa tên khoá học, đường link, con số giờ học hay giá tiền.',
    'Viết tiếng Việt, giọng khích lệ, gọn.',
  ].join(' ');

  const prompt = [
    'KỸ NĂNG CÒN THIẾU:',
    skills.map((skill) => `- ${skill}`).join('\n'),
    '',
    'Với MỖI kỹ năng trên, viết một gợi ý cách bổ sung.',
  ].join('\n');

  return { system, prompt };
}
