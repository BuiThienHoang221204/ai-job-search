import { tool } from 'ai';
import { z } from 'zod';
import type { ReadLog, ToolDeps } from '../agent.types.js';

const SKILL_NAME = 'job-application-assistant';

/** Khung đặc tả trong `.claude/skills/` - tri thức dùng chung với Claude Code. */
export const readSkillReferenceTool = (deps: ToolDeps, seen: ReadLog) =>
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

      // Lần thứ hai KHÔNG trả nội dung: nó đã nằm trong hội thoại, và đổ lại
      // vài nghìn token chỉ làm prompt phình ra rồi model càng dễ lạc.
      const key = `skill:${file}`;
      if (seen.has(key)) {
        return Promise.resolve({
          file,
          note: 'Bạn đã đọc file này ở một bước trước, nội dung nằm nguyên trong hội thoại phía trên. Dùng lại nó và đi tiếp.',
        });
      }

      seen.add(key);
      return Promise.resolve({ file, content: body });
    },
  });
