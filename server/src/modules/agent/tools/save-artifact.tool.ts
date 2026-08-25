import { tool } from 'ai';
import { z } from 'zod';
import { userKey } from '../../storage/storage.interface.js';
import type { ArtifactRecord, ToolContext, ToolDeps } from '../agent.types.js';

/**
 * Tên file hợp lệ: tối đa SÁU cấp, mỗi cấp chữ-số-gạch, không dấu chấm kép.
 *
 * Độ sâu không phải thứ cần chặn: khoá luôn được ghép dưới
 * `<userId>/agent_runs/<runId>/`, nên một đường dẫn dài chỉ tạo thêm thư mục
 * bên trong workspace của chính lượt chạy đó. Thứ cần chặn là `..` để không leo
 * ra ngoài, và tên rỗng.
 *
 * Trần một cấp ở bản đầu đã trả giá hai lần: lượt `/apply` mất một bước vì
 * `cv/main_....tex`, rồi lượt `/interview` mất 39 giây vì
 * `documents/applications/<công ty>/<vị trí>/interview_prep.md` - năm cấp, và
 * đúng cách đặt tên mà kịch bản trong `.claude/commands/` dạy nó. Sáu cấp để
 * còn chỗ thở.
 */
const SEGMENT = '[a-z0-9._-]{1,60}';
const SAFE_NAME = new RegExp(`^(?:${SEGMENT}/){0,5}${SEGMENT}$`, 'i');

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
        .describe(
          'Đường dẫn tương đối trong workspace của lượt chạy, tối đa sáu cấp. Ví dụ "cv/main.tex".',
        ),
      content: z.string().describe('Toàn bộ nội dung file'),
    }),
    execute: async ({ name, content }) => {
      if (!SAFE_NAME.test(name) || name.includes('..')) {
        return {
          error: `Tên file không hợp lệ: ${name}. Dùng chữ, số, gạch, dấu chấm và tối đa sáu cấp thư mục.`,
        };
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
