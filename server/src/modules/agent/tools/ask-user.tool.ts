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
      'Hỏi người dùng một câu rồi DỪNG. Chỉ dùng khi cần họ quyết định, ví dụ có nên soạn hồ sơ cho vị trí này không.',
    inputSchema: z.object({
      question: z.string().describe('Câu hỏi, viết bằng tiếng Việt'),
    }),
    execute: ({ question }) => Promise.resolve({ asked: question }),
  });
