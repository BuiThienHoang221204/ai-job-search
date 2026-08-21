import { tool } from 'ai';
import { z } from 'zod';

/**
 * Hỏi người dùng rồi DỪNG.
 *
 * Tool này không tự dừng được gì cả - nó chỉ trả về một kết quả hợp lệ. Thứ cắt
 * vòng lặp là `stopOnTool` ở phía `AiService.runTools`, và `AgentRunnerService`
 * đọc bước cuối để biết agent đang chờ. Ba nơi phải khớp tên tool này.
 */
export const askUserTool = () =>
  tool({
    description:
      'Hỏi người dùng MỘT câu rồi DỪNG. Dùng khi cần họ quyết định (có nên soạn hồ sơ cho vị trí này không) hoặc khi kịch bản yêu cầu đối thoại với họ (đặt một câu phỏng vấn và chờ trả lời). Đừng gộp nhiều câu vào một lần gọi.',
    inputSchema: z.object({
      question: z.string().describe('MỘT câu hỏi, viết bằng tiếng Việt'),
    }),
    execute: ({ question }) => Promise.resolve({ asked: question }),
  });
