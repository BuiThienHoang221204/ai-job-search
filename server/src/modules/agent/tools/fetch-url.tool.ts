import { tool } from 'ai';
import { z } from 'zod';
import type { ToolDeps } from '../agent.types.js';
import { htmlToText } from '../utils/html-text.js';
import { assertPublicUrl } from '../utils/public-url.js';

/** Trần chữ trả về cho model sau khi bóc HTML. */
const TEXT_LIMIT = 20_000;

/** Tải một trang web. Chống SSRF nằm ở `assertPublicUrl`. */
export const fetchUrlTool = (deps: ToolDeps) =>
  tool({
    description:
      'Tải một trang web và trả về phần chữ. Dùng cho tin tuyển dụng người dùng đưa link, hoặc trang chủ công ty.',
    inputSchema: z.object({ url: z.string().describe('Địa chỉ đầy đủ') }),
    execute: async ({ url }) => {
      try {
        const target = await assertPublicUrl(url);
        const response = await fetch(target, {
          redirect: 'follow',
          signal: AbortSignal.timeout(deps.limits.fetchTimeoutMs),
          headers: { 'User-Agent': 'aijob-agent/1.0' },
        });

        if (!response.ok) {
          return { error: `Máy chủ trả về HTTP ${response.status}` };
        }

        const raw = await response.text();
        return {
          url: target.toString(),
          text: htmlToText(raw.slice(0, deps.limits.fetchMaxBytes)).slice(
            0,
            TEXT_LIMIT,
          ),
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
