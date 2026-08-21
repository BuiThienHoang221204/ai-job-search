import { tool } from 'ai';
import { z } from 'zod';
import type { ToolDeps } from '../agent.types.js';

type SearchResponse = {
  results?: Array<{ title?: string; url?: string; content?: string }>;
};

/**
 * Tìm trên web, dùng cho bước nghiên cứu công ty của người phản biện.
 *
 * Chỉ được đăng ký khi có key: một tool luôn trả lỗi còn tệ hơn một tool vắng
 * mặt, vì model sẽ gọi lại nó nhiều lần và mỗi lần tốn một bước.
 */
export const webSearchTool = (deps: ToolDeps) =>
  tool({
    description:
      'Tìm trên web. Dùng để nghiên cứu công ty trước khi viết thư. Trả về tiêu đề, đường dẫn và đoạn trích.',
    inputSchema: z.object({
      query: z.string().describe('Câu truy vấn, viết như gõ vào ô tìm kiếm'),
    }),
    execute: async ({ query }) => {
      const { search, fetchTimeoutMs } = deps.limits;

      try {
        const response = await fetch(search.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${search.apiKey}`,
          },
          body: JSON.stringify({ query, max_results: search.maxResults }),
          signal: AbortSignal.timeout(fetchTimeoutMs),
        });

        if (!response.ok) {
          return { error: `Dịch vụ tìm kiếm trả về HTTP ${response.status}` };
        }

        const body = (await response.json()) as SearchResponse;
        return {
          results: (body.results ?? []).map((item) => ({
            title: item.title ?? '',
            url: item.url ?? '',
            snippet: (item.content ?? '').slice(0, 600),
          })),
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
