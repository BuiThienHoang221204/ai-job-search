import { tool } from 'ai';
import { z } from 'zod';
import type { ToolDeps } from '../agent.types.js';
import { htmlToText } from '../utils/html-text.js';
import { fetchPage } from '../utils/http-get.js';

/** Trần chữ trả về cho model sau khi bóc HTML. */
const TEXT_LIMIT = 20_000;

/** Tải một trang web. Chống SSRF và lý do dùng curl nằm ở `http-get.ts`. */
export const fetchUrlTool = (deps: ToolDeps) =>
  tool({
    description:
      'Tải một trang web và trả về phần chữ. Dùng cho tin tuyển dụng người dùng đưa link, hoặc trang chủ công ty.',
    inputSchema: z.object({ url: z.string().describe('Địa chỉ đầy đủ') }),
    execute: async ({ url }) => {
      try {
        const page = await fetchPage(url, {
          timeoutMs: deps.limits.fetchTimeoutMs,
          maxBytes: deps.limits.fetchMaxBytes,
        });

        if (page.status < 200 || page.status >= 300) {
          /*
           * 401/403/429 từ portal tuyển dụng là CHẶN, không phải hỏng.
           *
           * Hiếm khi còn gặp từ khi tool này đi bằng curl, nhưng portal nào
           * chặn gắt hơn Cloudflare thì vẫn ra đây. Câu trả lời đúng là xin
           * người dùng dán nội dung, và tool phải NÓI RA điều đó: một lượt chạy
           * thật đã kết thúc bằng câu "bạn hãy paste nội dung vào đây" viết
           * dạng văn bản thường, nên người dùng không có ô nào để trả lời.
           */
          const blocked = [401, 403, 429].includes(page.status);
          return {
            error: blocked
              ? `Trang này chặn truy cập từ máy chủ (HTTP ${page.status}). Đừng thử lại URL đó. Hãy gọi tool \`ask_user\` để xin người dùng dán nội dung tin tuyển dụng.`
              : `Máy chủ trả về HTTP ${page.status}`,
          };
        }

        return {
          url: page.url,
          text: htmlToText(page.body).slice(0, TEXT_LIMIT),
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
