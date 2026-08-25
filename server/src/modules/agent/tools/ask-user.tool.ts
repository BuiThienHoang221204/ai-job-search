import { tool } from 'ai';
import { z } from 'zod';

/**
 * Tên tool, khai ở ĐÂY vì bốn chỗ khác phải khớp với nó.
 *
 * `buildToolSet` đặt khoá, `runTools` cắt vòng lặp bằng `stopOnTool`,
 * `AgentRunnerService` đọc bước cuối để biết agent đang chờ, và
 * `AgentService.answer` tìm đúng bước đó để ghi câu trả lời vào. Gõ tay chuỗi
 * `'ask_user'` ở bốn nơi thì đổi tên tool là hỏng ba nhánh trong im lặng.
 */
export const ASK_USER_TOOL = 'ask_user';

/**
 * Hỏi người dùng rồi DỪNG.
 *
 * Tool này không tự dừng được gì cả - nó chỉ trả về một kết quả hợp lệ. Thứ cắt
 * vòng lặp là `stopOnTool` ở phía `AiService.runTools`, và `AgentRunnerService`
 * đọc bước cuối để biết agent đang chờ.
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
