import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext, ToolDeps } from '../agent.types.js';

/** Hồ sơ ứng viên - nguồn sự thật duy nhất, thay cho `01-candidate-profile.md`. */
export const readProfileTool = (deps: ToolDeps, context: ToolContext) =>
  tool({
    description:
      'Đọc hồ sơ ứng viên hiện tại: chức danh, kỹ năng, kinh nghiệm, dự án, học vấn, định hướng. Đây là NGUỒN SỰ THẬT duy nhất về ứng viên.',
    inputSchema: z.object({}),
    execute: async () => {
      const [profile, user] = await Promise.all([
        deps.prisma.profile.findUnique({ where: { userId: context.userId } }),
        deps.prisma.user.findUniqueOrThrow({
          where: { id: context.userId },
          select: { name: true, email: true },
        }),
      ]);

      return {
        name: user.name,
        email: user.email,
        summary: deps.prompts.profileSummary(profile),
      };
    },
  });
