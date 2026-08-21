import { tool } from 'ai';
import { z } from 'zod';
import type { ToolDeps } from '../agent.types.js';

const SKILL_NAME = 'job-application-assistant';

/** Khung đặc tả trong `.claude/skills/` - tri thức dùng chung với Claude Code. */
export const readSkillReferenceTool = (deps: ToolDeps) =>
  tool({
    description:
      'Đọc một file khung đặc tả trong .claude/skills/job-application-assistant, ví dụ "04-job-evaluation.md" hay "03-writing-style.md".',
    inputSchema: z.object({
      file: z.string().describe('Tên file, kèm đuôi .md'),
    }),
    execute: ({ file }: { file: string }): Promise<Record<string, unknown>> => {
      const skill = deps.skills.get(SKILL_NAME);
      const body = skill.references.get(file);

      if (!body) {
        return Promise.resolve({
          error: `Không có file "${file}". Các file đang có: ${[...skill.references.keys()].join(', ')}`,
        });
      }
      return Promise.resolve({ file, content: body });
    },
  });
