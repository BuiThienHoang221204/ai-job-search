import { tool } from 'ai';
import { z } from 'zod';
import type { ToolDeps } from '../agent.types.js';

/** Một dòng kết quả sau khi đã bóc khỏi phản hồi của Serper. */
export type SearchHit = { title: string; url: string; snippet: string };

/**
 * Bóc kết quả từ phản hồi của Serper (google.serper.dev).
 *
 * Tách khỏi phần gọi mạng vì đây mới là chỗ dễ vỡ âm thầm: Serper trả nhiều
 * khối cạnh nhau (`organic`, `knowledgeGraph`, `answerBox`, `peopleAlsoAsk`),
 * và đọc nhầm khối thì tool luôn trả về mảng rỗng mà không có lỗi nào — agent
 * sẽ kết luận "không tìm thấy gì về công ty này" thay vì "tra cứu hỏng".
 *
 * Tên trường của Serper là `link` và `snippet`, KHÔNG phải `url` và `content`
 * như Tavily.
 */
export function parseSerper(body: unknown): SearchHit[] {
  if (typeof body !== 'object' || body === null) return [];

  const organic = (body as { organic?: unknown }).organic;
  if (!Array.isArray(organic)) return [];

  return organic
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    )
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title : '',
      url: typeof item.link === 'string' ? item.link : '',
      snippet:
        typeof item.snippet === 'string' ? item.snippet.slice(0, 600) : '',
    }))
    .filter((hit) => hit.url !== '');
}

/**
 * Tìm trên web, dùng cho bước nghiên cứu công ty của người phản biện.
 *
 * Chỉ được đăng ký khi có key: một tool luôn trả lỗi còn tệ hơn một tool vắng
 * mặt, vì model sẽ gọi lại nó nhiều lần và mỗi lần tốn một bước.
 *
 * `gl`/`hl` ghim về Việt Nam: tra "Công ty Cổ phần Thương mại Minh Long" trên
 * kết quả tiếng Anh cho ra một danh sách hoàn toàn khác, thường là rỗng.
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
            // Serper dùng header riêng, KHÔNG phải `Authorization: Bearer`.
            'X-API-KEY': search.apiKey,
          },
          body: JSON.stringify({
            q: query,
            num: search.maxResults,
            gl: 'vn',
            hl: 'vi',
          }),
          signal: AbortSignal.timeout(fetchTimeoutMs),
        });

        if (!response.ok) {
          return { error: `Dịch vụ tìm kiếm trả về HTTP ${response.status}` };
        }

        return { results: parseSerper(await response.json()) };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
