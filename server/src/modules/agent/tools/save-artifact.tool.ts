import { tool } from 'ai';
import { z } from 'zod';
import { userKey } from '../../storage/storage.interface.js';
import type { ArtifactRecord, ToolContext, ToolDeps } from '../agent.types.js';

/**
 * Tên file hợp lệ: tuỳ chọn MỘT cấp thư mục, rồi tới tên file.
 *
 * Cho phép thư mục vì kịch bản dạy agent ghi vào `cv/` và `cover_letters/`; ở
 * lượt chạy thật nó đã mất nguyên một bước (60 giây) để thử lại sau khi bị từ
 * chối `cv/main_....tex`. Vẫn chặn `..` để không leo ra khỏi workspace.
 */
const SAFE_NAME = /^(?:[a-z0-9_-]{1,40}\/)?[a-z0-9._-]{1,60}$/i;

/** Ghi một file kết quả vào workspace của lượt chạy. */
export const saveArtifactTool = (
  deps: ToolDeps,
  context: ToolContext,
  artifacts: ArtifactRecord[],
) =>
  tool({
    description:
      'Lưu một file kết quả của lượt chạy này, ví dụ CV dạng LaTeX hay thư xin việc. Gọi lại cùng tên sẽ ghi đè.',
    inputSchema: z.object({
      name: z
        .string()
        .describe('Tên file, tối đa một cấp thư mục, ví dụ "cv/main.tex"'),
      content: z.string().describe('Toàn bộ nội dung file'),
    }),
    execute: async ({ name, content }) => {
      if (!SAFE_NAME.test(name) || name.includes('..')) {
        return { error: `Tên file không hợp lệ: ${name}` };
      }

      const key = userKey(context.userId, 'agent_runs', context.runId, name);
      await deps.storage.write(key, content);

      const record = { name, key, bytes: Buffer.byteLength(content) };
      const existing = artifacts.findIndex((item) => item.name === name);
      if (existing === -1) artifacts.push(record);
      else artifacts[existing] = record;

      return { saved: name, bytes: record.bytes };
    },
  });
