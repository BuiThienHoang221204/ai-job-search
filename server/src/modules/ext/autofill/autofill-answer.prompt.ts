import { z } from 'zod';
import { cappedTextVi } from '@/common/model-output';
import type { AutofillData } from '../profile/autofill-fields';

const ANSWER_MAX = 1500;

export const answerSchema = z.object({
  answer: cappedTextVi(
    ANSWER_MAX,
    'Câu trả lời cho một ô trong đơn ứng tuyển, giọng ứng viên.',
  ),
});

export function answerPrompt(
  data: AutofillData,
  question: string,
  role?: string,
  company?: string,
): { system: string; prompt: string } {
  const system = [
    'Bạn viết giúp ứng viên câu trả lời cho MỘT ô trong đơn ứng tuyển trực tuyến.',
    'Giọng ngôi thứ nhất, ngắn gọn, thành thật, chuyên nghiệp.',
    'CHỈ dựa trên hồ sơ được cung cấp — tuyệt đối không bịa thành tích, con số hay công ty.',
    'Trả lời bằng đúng ngôn ngữ của câu hỏi.',
  ].join(' ');

  const profileLines = [
    data.headline && `Vị trí: ${data.headline}`,
    data.summary && `Tóm tắt: ${data.summary}`,
    data.skills.length > 0 && `Kỹ năng: ${data.skills.join(', ')}`,
    data.location && `Nơi ở: ${data.location}`,
  ].filter(Boolean);

  const target = [
    role && `Vị trí ứng tuyển: ${role}`,
    company && `Công ty: ${company}`,
  ].filter(Boolean);

  const prompt = [
    'HỒ SƠ ỨNG VIÊN:',
    profileLines.length > 0 ? profileLines.join('\n') : '(hồ sơ còn sơ sài)',
    ...(target.length > 0 ? ['', ...target] : []),
    '',
    'CÂU HỎI TRONG ĐƠN:',
    question,
    '',
    'Viết câu trả lời.',
  ].join('\n');

  return { system, prompt };
}
