import { tool } from 'ai';
import { z } from 'zod';
import type { ReadLog, ToolContext, ToolDeps } from '../agent.types.js';

/** Hồ sơ ứng viên - nguồn sự thật duy nhất, thay cho `01-candidate-profile.md`. */
export const readProfileTool = (
  deps: ToolDeps,
  context: ToolContext,
  seen: ReadLog,
) =>
  tool({
    description:
      'Đọc hồ sơ ứng viên hiện tại: chức danh, kỹ năng, kinh nghiệm, dự án, học vấn, định hướng. Đây là NGUỒN SỰ THẬT duy nhất về ứng viên.',
    inputSchema: z.object({}),
    execute: async (): Promise<Record<string, unknown>> => {
      // Hồ sơ không đổi giữa chừng một lượt chạy, nên lần hai là lãng phí thuần.
      if (seen.has('profile')) {
        return {
          note: 'Bạn đã đọc hồ sơ ứng viên ở một bước trước, nội dung nằm nguyên trong hội thoại phía trên.',
        };
      }

      const [profile, user] = await Promise.all([
        deps.prisma.profile.findUnique({ where: { userId: context.userId } }),
        deps.prisma.user.findUniqueOrThrow({
          where: { id: context.userId },
          select: { name: true, email: true },
        }),
      ]);

      seen.add('profile');
      return {
        name: user.name,
        email: user.email,
        summary: deps.prompts.profileSummary(profile),
      };
    },
  });
