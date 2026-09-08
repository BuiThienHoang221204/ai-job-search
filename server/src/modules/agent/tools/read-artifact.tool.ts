import { tool } from 'ai';
import { z } from 'zod';
import { userKey } from '../../storage/storage.interface.js';
import type { ArtifactRecord, ToolContext, ToolDeps } from '../agent.types.js';

export const readArtifactTool = (
  deps: ToolDeps,
  context: ToolContext,
  artifacts: ArtifactRecord[],
) =>
  tool({
    description:
      'Đọc lại nội dung một file đã lưu trong lượt chạy này, ví dụ "cv/main.tex". Dùng khi cần sửa file đã viết trước đó.',
    inputSchema: z.object({
      name: z.string().describe('Tên file đúng như lúc gọi save_artifact'),
    }),
    execute: async ({ name }) => {
      const known = artifacts.some((item) => item.name === name);
      if (!known) {
        return {
          error: `Chưa lưu file "${name}" trong lượt này. Các file đang có: ${
            artifacts.map((item) => item.name).join(', ') ||
            '(chưa có file nào)'
          }`,
        };
      }

      const key = userKey(context.userId, 'agent_runs', context.runId, name);
      try {
        return { name, content: await deps.storage.readText(key) };
      } catch (error) {
        return {
          error: `Không đọc được file "${name}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  });
