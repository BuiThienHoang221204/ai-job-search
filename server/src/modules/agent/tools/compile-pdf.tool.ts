import { tool } from 'ai';
import { z } from 'zod';
import { missingGlyphs } from '../../documents/latex-compile.js';
import { userKey } from '../../storage/storage.interface.js';
import type { ToolContext, ToolDeps } from '../agent.types.js';

/** Đếm trang bằng số object `/Type /Page` trong PDF. */
const countPages = (pdf: Buffer): number =>
  (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length || 1;

/**
 * Compile một artifact `.tex` rồi trả về SỐ ĐO, không trả về file.
 *
 * Bản gốc `/apply` bắt Claude mở ảnh trang giấy ra nhìn. Ở đây không có mắt,
 * nên thứ thay thế được là con số: mấy trang, và những ký tự font không vẽ
 * được - đúng hai thứ đã sinh ra lỗi thật trước đây (thư tràn sang trang hai,
 * và chữ tiếng Việt biến mất khỏi trang giấy).
 */
export const compilePdfTool = (deps: ToolDeps, context: ToolContext) =>
  tool({
    description:
      'Compile một file .tex đã lưu thành PDF và cho biết số trang cùng những ký tự font không vẽ được. Dùng để tự kiểm trước khi kết thúc.',
    inputSchema: z.object({
      name: z.string().describe('Tên file .tex đã lưu bằng save_artifact'),
    }),
    execute: async ({ name }) => {
      const key = userKey(context.userId, 'agent_runs', context.runId, name);

      let tex: string;
      try {
        tex = await deps.storage.readText(key);
      } catch {
        return { error: `Chưa có file "${name}". Hãy save_artifact trước.` };
      }

      const result = await deps.latex.compile(tex);
      if (!result.ok) return { ok: false, reason: result.reason };

      return {
        ok: true,
        pages: countPages(result.pdf),
        missingGlyphs: missingGlyphs(result.warnings.join('\n')),
        warnings: result.warnings.slice(0, 20),
      };
    },
  });
