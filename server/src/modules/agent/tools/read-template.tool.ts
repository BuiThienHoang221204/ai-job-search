import { tool } from 'ai';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { ToolDeps } from '../agent.types.js';

/** Chỉ hai thư mục này, và chỉ một cấp - đường dẫn đến từ model. */
const ALLOWED = /^(cv|cover_letters)\/[a-z0-9._-]{1,60}$/i;

/**
 * Template LaTeX gốc trong `cv/` và `cover_letters/`.
 *
 * Thiếu tool này, agent làm đúng thứ tệ nhất nó có thể làm: ở lượt chạy thật nó
 * cần `cv/main_example.tex`, không có đường nào đọc, nên **tự bịa ra một URL**
 * (`https://example.com/main_example.tex`) rồi tải. Mất trắng một bước, và nếu
 * URL đó tình cờ tồn tại thì còn tệ hơn mất bước.
 */
export const readTemplateTool = (deps: ToolDeps) =>
  tool({
    description:
      'Đọc một template LaTeX gốc của hệ thống, ví dụ "cv/main_example.tex" hoặc "cover_letters/cover_example.tex". Dùng làm khung khi soạn tài liệu.',
    inputSchema: z.object({
      path: z
        .string()
        .describe('Đường dẫn tương đối, ví dụ "cv/main_example.tex"'),
    }),
    execute: async ({ path }): Promise<Record<string, unknown>> => {
      if (!ALLOWED.test(path) || path.includes('..')) {
        return {
          error: `Chỉ đọc được file trong cv/ và cover_letters/. Nhận được: ${path}`,
        };
      }

      try {
        const content = await readFile(
          join(deps.limits.templatesRoot, path),
          'utf8',
        );
        return { path, content };
      } catch {
        return { error: `Không có file "${path}".` };
      }
    },
  });
